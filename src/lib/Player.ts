import { EventEmitter } from "events";
import { LavalinkNode } from "./LavalinkNode";
import { Manager } from "./Manager";
import { PlayerUpdateVoiceState, JoinOptions } from "./Types";
import { Event, TrackStartEvent, TrackEndEvent, TrackExceptionEvent, WebSocketClosedEvent, TrackStuckEvent, PlayerState, Equalizer, PlayData, Filters } from "lavalink-types";

/**
 * The Player class, this handles everything to do with the guild sides of things, like playing, stoping, pausing, resuming etc
 */
export class Player extends EventEmitter {
    /**
     * The PlayerState of this Player
     */
    public state: Partial<PlayerState> & { filters: Filters; } = { filters: {} };
    /**
     * Whether or not the player is actually playing anything
     */
    public playing = false;
    /**
     * When the track started playing
     */
    public timestamp: number | null = null;
    /**
     * Whether or not the song that is playing is paused or not
     */
    public paused = false;
    /**
     * The current track in Lavalink's base64 string form
     */
    public track: string | null = null;
    /**
     * The voiceUpdateState of the player, used for swtiching nodes
     */
    public voiceUpdateState: PlayerUpdateVoiceState | null = null;

    /**
     * The constructor of the player
     * @param node The Lavalink of the player
     * @param id the id of the player, aka the guild id
     */
    public constructor(public node: LavalinkNode, public id: string) {
        super();

        this.on("event", data => {
            switch (data.type) {
                case "TrackStartEvent":
                    if (this.listenerCount("start")) this.emit("start", data);
                    break;
                case "TrackEndEvent":
                    if (data.reason !== "REPLACED") this.playing = false;
                    this.track = null;
                    this.timestamp = null;
                    if (this.listenerCount("end")) this.emit("end", data);
                    break;
                case "TrackExceptionEvent":
                    if (this.listenerCount("error")) this.emit("error", data);
                    break;
                case "TrackStuckEvent":
                    this.stop();
                    if (this.listenerCount("end")) this.emit("end", data);
                    break;
                case "WebSocketClosedEvent":
                    if (this.listenerCount("error")) this.emit("error", data);
                    break;
                default:
                    if (this.listenerCount("warn")) this.emit("warn", `Unexpected event type: ${(data as { type: string; }).type}`);
                    break;
            }
        })
            .on("playerUpdate", data => {
                this.state = { filters: this.state.filters, ...data.state };
            });
    }


    /**
     * Plays the specified song using the base64 string from lavalink
     * @param track The base64 string of the song that you want to play
     * @param options Play options
     */
    public async play(track: string, options?: Omit<PlayData, "op" | "guildId" | "track">): Promise<boolean> {
        const d = await this.send("play", { ...options, track });
        this.track = track;
        this.playing = true;
        this.timestamp = Date.now();
        return d;
    }

    /**
     * Stops the music, depending on how the end event is handled this will either stop
     */
    public async stop(): Promise<boolean> {
        const d = await this.send("stop");
        this.playing = false;
        this.timestamp = null;
        return d;
    }

    /**
     * Pauses/Resumes the song depending on what is specified
     * @param pause Whether or not to pause whats currently playing
     */
    public async pause(pause: boolean): Promise<boolean> {
        const d = await this.send("pause", { pause });
        this.paused = pause;
        if (this.listenerCount("pause")) this.emit("pause", pause);
        return d;
    }

    /**
     * Resumes the current song
     */
    public resume(): Promise<boolean> {
        return this.pause(false);
    }

    /**
     * Changes the volume, only for the current song
     * @param volume The volume as a float from 0.0 to 10.0. 1.0 is default.
     */
    public async volume(volume: number): Promise<boolean> {
        const d = await this.send("volume", { volume: volume * 100 });
        if (this.listenerCount("volume")) this.emit("volume", volume);
        return d;
    }

    /**
     * Seeks the current song to a certain position
     * @param position Seeks the song to the position specified in milliseconds, use the duration of the song from lavalink to get the duration
     */
    public async seek(position: number): Promise<boolean> {
        const d = await this.send("seek", { position });
        if (this.listenerCount("seek")) this.emit("seek", position);
        return d;
    }

    public async filters(options: Filters): Promise<boolean> {
        const d = await this.send("filters", options);
        this.state.filters = options;
        if (this.listenerCount("filters")) this.emit("filters", options);
        return d;
    }

    /**
     * Sets the equalizer of the current song, if you wanted to do something like bassboost
     * @param bands The bands that you want lavalink to modify read [IMPLEMENTATION.md](https://github.com/freyacodes/Lavalink/blob/master/IMPLEMENTATION.md#outgoing-messages) for more information
     */
    public async equalizer(bands: Equalizer[]): Promise<boolean> {
        const newFilters = Object.assign(this.state.filters, { equalizer: bands });
        const d = await this.filters(newFilters);
        return d;
    }

    /**
     * Sends a destroy signal to lavalink, basically just a cleanup op for lavalink to clean its shit up
     */
    public destroy(): Promise<boolean> {
        return this.send("destroy");
    }

    /**
     * Sends voiceUpdate information to lavalink so it can connect to discords voice servers properly
     * @param data The data lavalink needs to connect and recieve data from discord
     */
    public connect(data: PlayerUpdateVoiceState): Promise<boolean> {
        this.voiceUpdateState = data;
        return this.send("voiceUpdate", data);
    }

    /**
     * Use this to switch channels
     * @param channel The channel id of the channel you want to switch to
     * @param options selfMute and selfDeaf options
     */
    public switchChannel(channel: string, options: JoinOptions = {}): any {
        return this.manager.sendWS(this.id, channel, options);
    }

    /**
     * Used internally to make sure the Player's node is connected and to easily send data to lavalink
     * @param op the op code
     * @param data the data to send
     */
    private send(op: string, data?: object): Promise<boolean> {
        if (!this.node.connected) return Promise.reject(new Error("No available websocket connection for selected node."));
        return this.node.send({ ...data, op, guildId: this.id });
    }

    /**
     * The manager that created the player
     */
    public get manager(): Manager {
        return this.node.manager;
    }
}

export interface PlayerEvents {
    event: [Event];
    start: [TrackStartEvent];
    end: [TrackEndEvent | TrackStuckEvent];
    pause: [boolean];
    seek: [number];
    error: [TrackExceptionEvent | WebSocketClosedEvent];
    warn: [string];
    volume: [number];
    playerUpdate: [{ state: PlayerState; }];
    filters: [Filters];
}

export interface Player {
    addListener<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    emit<E extends keyof PlayerEvents>(event: E, ...args: PlayerEvents[E]): boolean;
    eventNames(): Array<keyof PlayerEvents>;
    listenerCount(event: keyof PlayerEvents): number;
    listeners(event: keyof PlayerEvents): Array<(...args: Array<any>) => any>;
    off<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    on<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    once<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    prependListener<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    prependOnceListener<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
    rawListeners(event: keyof PlayerEvents): Array<(...args: Array<any>) => any>;
    removeAllListeners(event?: keyof PlayerEvents): this;
    removeListener<E extends keyof PlayerEvents>(event: E, listener: (...args: PlayerEvents[E]) => any): this;
}
