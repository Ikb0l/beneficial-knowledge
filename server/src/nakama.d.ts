// Nakama Runtime TypeScript Definitions
// Based on Nakama 3.x runtime

declare namespace nkruntime {
  export interface Context {
    env: { [key: string]: string };
    executionMode: string;
    headers: { [key: string]: string[] };
    queryParams: { [key: string]: string[] };
    userId: string;
    username: string;
    vars: { [key: string]: string };
    sessionId: string;
    clientIp: string;
    clientPort: string;
    lang: string;
  }

  export interface Logger {
    debug(format: string, ...args: any[]): void;
    error(format: string, ...args: any[]): void;
    info(format: string, ...args: any[]): void;
    warn(format: string, ...args: any[]): void;
  }

  export interface Nakama {
    authenticateCustom(id: string, username?: string, create?: boolean, metadata?: object): AuthResult;
    storageRead(reads: StorageReadRequest[]): StorageObject[];
    storageWrite(writes: StorageWriteRequest[]): StorageWriteAck[];
    storageDelete(deletes: StorageDeleteRequest[]): void;
    storageList(userId: string | undefined, collection: string, limit?: number, cursor?: string): StorageObjectList;
    accountGetId(userId: string): Account;
    accountsGetId(userIds: string[]): Account[];
    accountUpdateId(userId: string, username?: string, displayName?: string, avatarUrl?: string, langTag?: string, location?: string, timezone?: string, metadata?: object): void;
    usersGetId(userIds: string[]): User[];
    usersGetUsername(usernames: string[]): User[];
    friendsList(userId: string, limit?: number, state?: number, cursor?: string): FriendList;
    friendsAdd(userId: string, username: string, ids: string[], usernames: string[]): void;
    friendsDelete(userId: string, username: string, ids: string[], usernames: string[]): void;
    friendsBlock(userId: string, username: string, ids: string[], usernames: string[]): void;
    streamUserList(mode: number, subject: string, subcontext: string, label: string, includeHidden?: boolean, includeNotHidden?: boolean): Presence[];
    leaderboardCreate(id: string, authoritative: boolean, sortOrder?: string, operator?: string, resetSchedule?: string, metadata?: object): void;
    leaderboardRecordWrite(id: string, oderId: string, username?: string, score?: number, subscore?: number, metadata?: object): LeaderboardRecord;
    leaderboardRecordsList(id: string, oderIds?: string[], limit?: number, cursor?: string, expiry?: number): LeaderboardRecordList;
    leaderboardRecordsListCursorFromRank(id: string, rank: number, expiry?: number): string;
    leaderboardRecordDelete(id: string, oderId: string): void;
    matchCreate(module: string, params?: { [key: string]: string }): string;
    matchGet(id: string): Match;
    matchList(limit?: number, authoritative?: boolean, label?: string, minSize?: number, maxSize?: number, query?: string): Match[];
    matchSignal(id: string, data: string): string;
    notificationSend(userId: string, subject: string, content: object, code: number, senderId?: string, persistent?: boolean): void;
    notificationsSend(notifications: NotificationRequest[]): void;
    walletUpdate(userId: string, changeset: { [key: string]: number }, metadata?: object, updateLedger?: boolean): WalletUpdateResult;
    walletLedgerList(userId: string, limit?: number, cursor?: string): WalletLedgerList;
    event(name: string, properties: { [key: string]: string }, timestamp?: number, external?: boolean): void;
    httpRequest(url: string, method: string, headers?: { [key: string]: string }, body?: string, timeout?: number): HttpResponse;
    base64Encode(input: string | ArrayBuffer): string;
    base64Decode(input: string): string;
    base64UrlEncode(input: string | ArrayBuffer): string;
    base64UrlDecode(input: string): string;
    bcryptHash(password: string): string;
    bcryptCompare(password: string, hash: string): boolean;
    jsonEncode(object: any): string;
    jsonDecode(json: string): any;
    md5Hash(input: string): string;
    sha256Hash(input: string): string;
    hmacSha256Hash(input: string, key: string): string;
    rsaSha256Hash(input: string, key: string): string;
    aes128Encrypt(input: string, key: string): string;
    aes128Decrypt(input: string, key: string): string;
    aes256Encrypt(input: string, key: string): string;
    aes256Decrypt(input: string, key: string): string;
    uuidv4(): string;
    cronNext(expression: string, timestamp: number): number;
    cronPrev(expression: string, timestamp: number): number;
    sqlExec(query: string, args?: any[]): SqlExecResult;
    sqlQuery(query: string, args?: any[]): SqlQueryResult;
    binaryToString(data: ArrayBuffer): string;
    stringToBinary(data: string): ArrayBuffer;
  }

  export interface Initializer {
    registerRpc(id: string, fn: RpcFunction): void;
    registerBeforeRt(id: string, fn: BeforeRtFunction): void;
    registerAfterRt(id: string, fn: AfterRtFunction): void;
    registerMatch(name: string, handlers: MatchHandler): void;
    registerMatchmakerMatched(fn: MatchmakerMatchedFunction): void;
    registerBeforeAuthenticateCustom(fn: BeforeAuthenticateCustomFunction): void;
    registerAfterAuthenticateCustom(fn: AfterAuthenticateCustomFunction): void;
    registerBeforeGetAccount(fn: BeforeHookFunction): void;
    registerAfterGetAccount(fn: AfterHookFunction): void;
    registerLeaderboardReset(fn: LeaderboardResetFunction): void;
  }

  export interface AuthResult {
    userId: string;
    username: string;
    created: boolean;
  }

  export interface AuthenticateCustomRequest {
    account?: {
      id?: string;
      vars?: { [key: string]: string };
    };
    create?: boolean;
    username?: string;
  }

  export interface Session {
    userId: string;
    username: string;
    vars: { [key: string]: string };
    expireTime: number;
    createTime: number;
    isexpired(time: number): boolean;
  }

  export interface StorageReadRequest {
    collection: string;
    key: string;
    userId: string;
  }

  export interface StorageObject {
    collection: string;
    key: string;
    userId: string;
    value: any;
    version: string;
    permissionRead: number;
    permissionWrite: number;
    createTime: number;
    updateTime: number;
  }

  export interface StorageWriteRequest {
    collection: string;
    key: string;
    userId: string;
    value: any;
    version?: string;
    permissionRead?: number;
    permissionWrite?: number;
  }

  export interface StorageWriteAck {
    collection: string;
    key: string;
    userId: string;
    version: string;
  }

  export interface StorageDeleteRequest {
    collection: string;
    key: string;
    userId: string;
    version?: string;
  }

  export interface Account {
    user?: User;
    wallet?: string;
    email?: string;
    devices?: AccountDevice[];
    customId?: string;
    verifyTime?: number;
    disableTime?: number;
  }

  export interface User {
    id?: string;
    userId?: string; // Nakama JS runtime uses userId instead of id
    username: string;
    displayName?: string;
    avatarUrl?: string;
    langTag?: string;
    location?: string;
    timezone?: string;
    metadata?: object;
    facebookId?: string;
    googleId?: string;
    gamecenterId?: string;
    steamId?: string;
    online?: boolean;
    edgeCount?: number;
    createTime?: number;
    updateTime?: number;
  }

  export interface Friend {
    user?: User;
    state?: number; // 0: mutual, 1: invite sent, 2: invite received, 3: blocked
    updateTime?: number;
  }

  export interface FriendList {
    friends?: Friend[];
    cursor?: string;
  }

  export interface StorageObjectList {
    objects?: StorageObject[];
    cursor?: string;
  }

  export interface AccountDevice {
    id: string;
    vars?: { [key: string]: string };
  }

  export interface LeaderboardRecord {
    leaderboardId: string;
    ownerId: string;
    username: string;
    score: number;
    subscore: number;
    numScore: number;
    metadata: object;
    createTime: number;
    updateTime: number;
    expiryTime?: number;
    rank: number;
  }

  export interface LeaderboardRecordList {
    records?: LeaderboardRecord[];
    oderRecords?: LeaderboardRecord[];
    prevCursor?: string;
    nextCursor?: string;
  }

  export interface Match {
    matchId: string;
    authoritative: boolean;
    label?: string;
    size: number;
    tickRate: number;
    handlerName: string;
  }

  export interface NotificationRequest {
    userId: string;
    subject: string;
    content: object;
    code: number;
    senderId?: string;
    persistent?: boolean;
  }

  export interface WalletUpdateResult {
    updated: { [key: string]: number };
    previous: { [key: string]: number };
  }

  export interface WalletLedgerList {
    items?: WalletLedgerItem[];
    cursor?: string;
  }

  export interface WalletLedgerItem {
    id: string;
    userId: string;
    changeset: { [key: string]: number };
    metadata: object;
    createTime: number;
    updateTime: number;
  }

  export interface HttpResponse {
    code: number;
    headers: { [key: string]: string[] };
    body: string;
  }

  export interface SqlExecResult {
    rowsAffected: number;
  }

  export interface SqlQueryResult {
    rows: any[];
  }

  export interface Presence {
    userId: string;
    sessionId: string;
    username: string;
    node: string;
    status?: string;
    persistence?: boolean;
    reason?: number;
  }

  // MatchState is defined by the user in their code
  export type MatchState = any;

  export interface MatchDispatcher {
    broadcastMessage(opCode: number, data?: string | ArrayBuffer, presences?: Presence[] | null, sender?: Presence | null, reliable?: boolean): void;
    broadcastMessageDeferred(opCode: number, data?: string | ArrayBuffer, presences?: Presence[] | null, sender?: Presence | null, reliable?: boolean): void;
    matchKick(presences: Presence[]): void;
    matchLabelUpdate(label: string): void;
  }

  export interface MatchMessage {
    sender: Presence;
    persistence: boolean;
    status: string;
    opCode: number;
    data: ArrayBuffer;
    reliable: boolean;
    receiveTimeMs: number;
  }

  export interface MatchmakerResult {
    users: MatchmakerUser[];
    properties: { [key: string]: any };
  }

  export interface MatchmakerUser {
    presence: Presence;
    partyId: string;
    properties: { [key: string]: any };
  }

  export interface MatchHandler {
    matchInit: MatchInitFunction;
    matchJoinAttempt: MatchJoinAttemptFunction;
    matchJoin: MatchJoinFunction;
    matchLeave: MatchLeaveFunction;
    matchLoop: MatchLoopFunction;
    matchTerminate: MatchTerminateFunction;
    matchSignal: MatchSignalFunction;
  }

  export type InitModule = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    initializer: Initializer
  ) => void;

  export type RpcFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    payload: string
  ) => string;

  export type BeforeRtFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    envelope: any
  ) => any;

  export type AfterRtFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    envelope: any
  ) => void;

  export type BeforeHookFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    data: any
  ) => any;

  export type AfterHookFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    data: any,
    request: any
  ) => void;

  export type BeforeAuthenticateCustomFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    data: AuthenticateCustomRequest
  ) => AuthenticateCustomRequest | void;

  export type AfterAuthenticateCustomFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    data: AuthResult,
    request: AuthenticateCustomRequest
  ) => void;

  export type MatchmakerMatchedFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    matches: MatchmakerResult[]
  ) => string | void;

  export type LeaderboardResetFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    leaderboard: { id: string; metadata: object },
    reset: number
  ) => void;

  export type MatchInitFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    params: { [key: string]: string }
  ) => { state: T; tickRate: number; label: string };

  export type MatchJoinAttemptFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    presence: Presence,
    metadata: { [key: string]: string }
  ) => { state: T; accept: boolean; rejectMessage?: string } | null;

  export type MatchJoinFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    presences: Presence[]
  ) => { state: T } | null;

  export type MatchLeaveFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    presences: Presence[]
  ) => { state: T } | null;

  export type MatchLoopFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    messages: MatchMessage[]
  ) => { state: T } | null;

  export type MatchTerminateFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    graceSeconds: number
  ) => { state: T } | null;

  export type MatchSignalFunction<T = MatchState> = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: T,
    data: string
  ) => { state: T; data?: string } | null;
}

// InitModule is defined in main.ts
