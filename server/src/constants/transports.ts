// server/src/constants/transports.ts
const TRANSPORTS = ['polling', 'websocket', 'webtransport'] as const;

export type Transport = typeof TRANSPORTS[number];

export default TRANSPORTS;
