/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors
	
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Stream } from "@spacebar/util";
import { mediaServer, Send, VoiceOPCodes, VoicePayload, WebRtcWebSocket } from "@spacebar/webrtc";
import type { WebRtcClient } from "@spacebarchat/spacebar-webrtc-types";
import type { MediasoupWebRtcClient } from "@spacebarchat/mediasoup-webrtc";
import { validateSchema, VoiceVideoSchema } from "@spacebar/schemas";

export async function onVideo(this: WebRtcWebSocket, payload: VoicePayload) {
    if (!this.webRtcClient) return;

    const { voiceRoomId } = this.webRtcClient;

    console.log(`[WebRTC] onVideo from ${this.user_id}:`, JSON.stringify(payload.d));

    const d = validateSchema("VoiceVideoSchema", payload.d) as VoiceVideoSchema;

    if (this.type === "stream") {
        const stream = await Stream.findOne({
            where: { id: voiceRoomId },
        });

        if (!stream) return;

        // only the stream owner can publish to a go live stream
        if (stream?.owner_id != this.user_id) {
            return;
        }
    }

    const stream = d.streams?.find((element) => element.active);

    const clientsThatNeedUpdate = new Set<WebRtcClient<WebRtcWebSocket>>();
    const wantsToProduceAudio = d.audio_ssrc !== 0;
    const wantsToProduceVideo = d.video_ssrc !== 0 && stream?.active;

    // this is to handle a really weird case where the client sends audio info before the
    // dtls ice connection is completely connected. Wait for connection for 3 seconds
    // and if no connection, just ignore this message
    if (!this.webRtcClient.webrtcConnected) {
        if (wantsToProduceAudio) {
            try {
                await Promise.race([
                    new Promise<void>((resolve, reject) => {
                        this.webRtcClient?.emitter.once("connected", () => resolve());
                    }),
                    new Promise<void>((resolve, reject) => {
                        // Reject after 3 seconds if still not connected
                        setTimeout(() => {
                            if (this.webRtcClient?.webrtcConnected) resolve();
                            else reject();
                        }, 3000);
                    }),
                ]);
            } catch (e) {
                return; // just ignore this message if client didn't connect within 3 seconds
            }
        } else return;
    }

    await Send(this, { op: VoiceOPCodes.MEDIA_SINK_WANTS, d: { any: 100 } });

    // first check if we need stop any tracks
    if (!wantsToProduceAudio && this.webRtcClient.isProducingAudio()) {
        this.webRtcClient.stopPublishingTrack("audio");
    }

    if (!wantsToProduceVideo && this.webRtcClient.isProducingVideo()) {
        this.webRtcClient.stopPublishingTrack("video");
    }

    // check if client has signaled that it will send audio
    if (wantsToProduceAudio) {
        // check if we are already producing audio, if not, publish a new audio track for it
        if (!this.webRtcClient!.isProducingAudio()) {
            console.log(`[${this.user_id}] publishing new audio track ssrc:${d.audio_ssrc}`);
            await this.webRtcClient.publishTrack("audio", {
                audio_ssrc: d.audio_ssrc,
            });
        }

        // now check that all clients have subscribed to our audio
        for (const client of mediaServer.getClientsForRtcServer<WebRtcWebSocket>(voiceRoomId)) {
            if (client.user_id === this.user_id) continue;

            if (!client.isSubscribedToTrack(this.user_id, "audio")) {
                console.log(`[${client.user_id}] subscribing to audio track ssrcs: ${d.audio_ssrc}`);
                await client.subscribeToTrack(this.webRtcClient.user_id, "audio");

                clientsThatNeedUpdate.add(client);
            }
        }
    }
    // check if client has signaled that it will send video
    if (wantsToProduceVideo) {
        this.webRtcClient!.videoStream = { ...stream, type: "video" }; // client sends "screen" on go live but expects "video" on response
        // check if we are already publishing video, if not, publish a new video track for it
        if (!this.webRtcClient!.isProducingVideo()) {
            console.log(`[WebRTC] [${this.user_id}] publishing new video track ssrc:${d.video_ssrc} room:${voiceRoomId}`);
            await this.webRtcClient.publishTrack("video", {
                video_ssrc: d.video_ssrc,
                rtx_ssrc: d.rtx_ssrc,
            });
        }

        // now check that all clients have subscribed to our video track
        const clientsInRoom = mediaServer.getClientsForRtcServer<WebRtcWebSocket>(voiceRoomId);
        console.log(`[WebRTC] onVideo (Producer ${this.user_id}): found ${Array.from(clientsInRoom).length} clients in room ${voiceRoomId}`);

        for (const client of clientsInRoom) {
            if (client.user_id === this.user_id) continue;

            const isSubscribed = client.isSubscribedToTrack(this.user_id, "video");
            console.log(`[WebRTC] onVideo (Producer ${this.user_id}): checking client ${client.user_id}. isSubscribed: ${isSubscribed}`);

            if (!isSubscribed) {
                console.log(`[${client.user_id}] subscribing to video track ssrc: ${d.video_ssrc}`);
                await client.subscribeToTrack(this.webRtcClient.user_id, "video");
                clientsThatNeedUpdate.add(client);
            } else {
                // If already subscribed, we still might need to send Op12 if they haven't received it?
                // But typically we only send if we just subscribed or if new tracks added.
                // However, for stream joining race conditions, maybe we should ensure Op12 is sent?
                // If isSubscribed is true, it means they consumed.
                // We'll add them to update list just in case (idempotent Op12 is fine).
                console.log(`[WebRTC] onVideo: client ${client.user_id} already subscribed, adding to update list to ensure Op12`);
                clientsThatNeedUpdate.add(client);
            }
        }
    }

    await Promise.all(
        Array.from(clientsThatNeedUpdate).map(async (client) => {
            const ssrcs = client.getOutgoingStreamSSRCsForUser(this.user_id);

            // Stream viewers must only receive op12 that includes video_ssrc; otherwise the viewer
            // sets remote description without video and stays black. Never send audio-only op12 in stream rooms.
            if (this.type === "stream" && (ssrcs.video_ssrc == null || ssrcs.video_ssrc === 0)) {
                console.log(`[WebRTC] Skipping op12 to stream viewer ${client.user_id} (no video_ssrc yet; producer ${this.user_id})`);
                return;
            }

            console.log(
                `[WebRTC] Sending op12 VIDEO to ${client.user_id} for producer ${this.user_id} with video_ssrc:${ssrcs.video_ssrc ?? "(none)"} rtx_ssrc:${ssrcs.rtx_ssrc ?? "(none)"}`,
            );

            // #region agent log
            fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location: "Video.ts:onVideo-sendOp12",
                    message: "Sending op12 to client",
                    data: {
                        toClient: client.user_id,
                        fromProducer: this.user_id,
                        video_ssrc: ssrcs.video_ssrc,
                        rtx_ssrc: ssrcs.rtx_ssrc,
                        audio_ssrc: ssrcs.audio_ssrc,
                        type: this.type,
                    },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    hypothesisId: "H1",
                }),
            }).catch(() => {});
            // #endregion

            return Send(client.websocket, {
                op: VoiceOPCodes.VIDEO,
                d: {
                    user_id: this.user_id,
                    // Send 0 when no audio consumer exists on this client's transport.
                    // The old fallback (getIncomingStreamSSRCs) sent a generated SSRC that doesn't
                    // match any consumer, causing phantom recvonly transceivers with wrong SSRCs.
                    // Note: in onVideo, the consumer was JUST created above, so ssrcs.audio_ssrc
                    // should always be defined here. The ?? 0 is just a safety net.
                    audio_ssrc: ssrcs.audio_ssrc ?? 0,
                    video_ssrc: ssrcs.video_ssrc ?? 0,
                    rtx_ssrc: ssrcs.rtx_ssrc ?? 0,
                    streams: d.streams?.map((x) => ({
                        ...x,
                        ssrc: ssrcs.video_ssrc ?? 0,
                        rtx_ssrc: ssrcs.rtx_ssrc ?? 0,
                        type: "video",
                    })),
                } as VoiceVideoSchema,
            });
        }),
    );
}

/**
 * Handle viewer ready signal (op 15).
 * When a stream viewer's WebRTC connection has completed SDP negotiation,
 * they send this signal. We then request a keyframe from the producer
 * so the viewer can start decoding video.
 */
export async function onViewerReady(this: WebRtcWebSocket, payload: VoicePayload) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            location: "Video.ts:onViewerReady-entry",
            message: "onViewerReady handler ENTERED",
            data: { viewer: this.user_id, hasClient: !!this.webRtcClient, payload: payload.d },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H2",
        }),
    }).catch(() => {});
    // #endregion

    if (!this.webRtcClient) {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                location: "Video.ts:onViewerReady-noClient",
                message: "onViewerReady: no webRtcClient",
                data: { viewer: this.user_id },
                timestamp: Date.now(),
                sessionId: "debug-session",
                hypothesisId: "H2",
            }),
        }).catch(() => {});
        // #endregion
        return;
    }

    // Cast to MediasoupWebRtcClient to access mediasoup-specific methods
    const client = this.webRtcClient as MediasoupWebRtcClient;

    const d = payload.d as { user_id?: string };
    const producer_user_id = d?.user_id;

    if (!producer_user_id) {
        console.log("[WebRTC] onViewerReady: missing producer user_id");
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                location: "Video.ts:onViewerReady-noProducerId",
                message: "onViewerReady: missing producer user_id",
                data: { viewer: this.user_id, payload: payload.d },
                timestamp: Date.now(),
                sessionId: "debug-session",
                hypothesisId: "H2",
            }),
        }).catch(() => {});
        // #endregion
        return;
    }

    console.log(`[WebRTC] onViewerReady: viewer ${this.user_id} ready for producer ${producer_user_id}`);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            location: "Video.ts:onViewerReady-beforeKeyframe",
            message: "About to request keyframe",
            data: { viewer: this.user_id, producer: producer_user_id, type: this.type, consumerCount: client.consumers?.length },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H3",
        }),
    }).catch(() => {});
    // #endregion

    // Request a keyframe for this viewer from the producer
    const success = await client.requestKeyFrame(producer_user_id);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/043f8e22-2b34-44f1-b19b-fc11dd5647b1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            location: "Video.ts:onViewerReady-afterKeyframe",
            message: "Keyframe request completed",
            data: { viewer: this.user_id, producer: producer_user_id, success },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H3",
        }),
    }).catch(() => {});
    // #endregion

    if (success) {
        console.log(`[WebRTC] onViewerReady: keyframe requested successfully for viewer ${this.user_id}`);
    } else {
        console.log(`[WebRTC] onViewerReady: failed to request keyframe for viewer ${this.user_id}`);
    }
}

// check if we are not subscribed to producers in this server, if not, subscribe
export async function subscribeToProducers(this: WebRtcWebSocket): Promise<void> {
    if (!this.webRtcClient || !this.webRtcClient.webrtcConnected) return;

    const clients = mediaServer.getClientsForRtcServer<WebRtcWebSocket>(this.webRtcClient.voiceRoomId);
    const clientList = Array.from(clients);

    if (this.type === "stream") {
        console.error(`[WebRTC stream] subscribeToProducers: viewer ${this.user_id} room ${this.webRtcClient.voiceRoomId}`);
    }

    await Promise.all(
        clientList.map(async (client) => {
            try {
                if (client.user_id === this.user_id) return;

                console.error(`[WebRTC stream] Checking client ${client.user_id} (video: ${client.isProducingVideo()})`);

                let needsUpdate = false;

                if (client.isProducingAudio() && !this.webRtcClient!.isSubscribedToTrack(client.user_id, "audio")) {
                    console.error(`[WebRTC stream] Subscribing to audio from ${client.user_id}`);
                    await this.webRtcClient!.subscribeToTrack(client.user_id, "audio");
                    needsUpdate = true;
                }

                if (client.isProducingVideo() && !this.webRtcClient!.isSubscribedToTrack(client.user_id, "video")) {
                    console.error(`[WebRTC stream] Subscribing to video from ${client.user_id}`);
                    await this.webRtcClient!.subscribeToTrack(client.user_id, "video");
                    needsUpdate = true;
                }

                // Removed !needsUpdate check. We must send Op12 if we are subscribed, regardless of when subscription happened.
                // subscribeToExistingProducersInRoom (called in onOffer) creates consumers but doesn't send Op12.
                // We must ensure Op12 is sent now.

                const ssrcs = this.webRtcClient!.getOutgoingStreamSSRCsForUser(client.user_id);
                console.error(`[WebRTC stream] SSRCs for ${client.user_id}: video=${ssrcs.video_ssrc}`);

                const codecs = (this.webRtcClient as MediasoupWebRtcClient).getOutgoingStreamCodecsForUser(client.user_id);

                if (this.type === "stream") {
                    const hasVideoSsrc = ssrcs.video_ssrc != null && ssrcs.video_ssrc !== 0;
                    if (!client.isProducingVideo() || !hasVideoSsrc) {
                        console.error(`[WebRTC stream] Skipping op12 to viewer ${this.user_id}. hasVideoSsrc=${hasVideoSsrc}, isProducingVideo=${client.isProducingVideo()}`);
                        return;
                    }
                }

                console.error(`[WebRTC stream] Sending Op12 to viewer ${this.user_id}`);
                await Send(this, {
                    op: VoiceOPCodes.VIDEO,
                    d: {
                        user_id: client.user_id,
                        // Send 0 when no consumer exists (no audio producer from this user yet).
                        // The old fallback (getIncomingStreamSSRCs) sent a generated SSRC that doesn't
                        // correspond to any consumer, causing the client to create phantom recvonly
                        // transceivers with wrong SSRCs that break audio demux.
                        // The client correctly ignores audio_ssrc=0 (doesn't create a transceiver).
                        audio_ssrc: ssrcs.audio_ssrc ?? 0,
                        video_ssrc: ssrcs.video_ssrc ?? 0,
                        rtx_ssrc: ssrcs.rtx_ssrc ?? 0,
                        video_pt: codecs.video_pt,
                        rtx_pt: codecs.rtx_pt,
                        audio_pt: codecs.audio_pt,
                        streams: [
                            client.videoStream ?? {
                                type: "video",
                                rid: "100",
                                ssrc: ssrcs.video_ssrc ?? 0,
                                active: client.isProducingVideo(),
                                quality: 100,
                                rtx_ssrc: ssrcs.rtx_ssrc ?? 0,
                                max_bitrate: 2500000,
                                max_framerate: 20,
                                max_resolution: { type: "fixed", width: 1280, height: 720 },
                            },
                        ],
                    } as VoiceVideoSchema,
                });
                console.error(`[WebRTC stream] Op12 sent successfully`);
            } catch (err) {
                console.error(`[WebRTC stream] ERROR in subscribeToProducers:`, err);
            }
        }),
    );
}
