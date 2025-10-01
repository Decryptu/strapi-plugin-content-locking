// server/src/bootstrap.ts
import type { Core } from '@strapi/strapi';
import { Server, type Socket } from 'socket.io';
import type { StrapiWithIO } from './types/strapi';
import DEFAULT_TRANSPORTS, { type Transport } from './constants/transports';

interface OpenEntityPayload {
  entityDocumentId: string;
  entityId: string;
}

interface CloseEntityPayload {
  entityId: string;
  entityDocumentId: string;
  userId: string | number;
}

const isValidTransportArray = (value: unknown): value is readonly Transport[] => {
  if (!Array.isArray(value)) return false;
  return value.every((item) =>
    item === 'polling' || item === 'websocket' || item === 'webtransport'
  );
};

const validateEntityPayload = (payload: unknown): payload is OpenEntityPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.entityDocumentId === 'string' &&
    typeof p.entityId === 'string' &&
    p.entityDocumentId.length > 0 &&
    p.entityId.length > 0
  );
};

const validateClosePayload = (payload: unknown): payload is CloseEntityPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.entityId === 'string' &&
    typeof p.entityDocumentId === 'string' &&
    (typeof p.userId === 'string' || typeof p.userId === 'number') &&
    p.entityId.length > 0 &&
    p.entityDocumentId.length > 0
  );
};

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  const strapiWithIO = strapi as StrapiWithIO;

  // Get configured transports with proper type validation
  const configuredTransports = strapi.plugin('record-locking').config('transports');
  const transports = isValidTransportArray(configuredTransports)
    ? [...configuredTransports]
    : [...DEFAULT_TRANSPORTS];

  // Initialize Socket.IO with proper configuration
  const io = new Server(strapi.server.httpServer, {
    cors: {
      origin: strapi.config.get('admin.url') || 'http://localhost:1337',
      credentials: true,
    },
    transports,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication token missing'));
    }

    try {
      // Strapi v5 way to verify JWT
      const { payload } = await strapi.admin.services.token.decodeJwtToken(token);
      
      if (!payload?.id) {
        return next(new Error('Invalid token'));
      }

      socket.data.userId = payload.id;
      next();
    } catch (error) {
      strapi.log.error('[Record Locking] Authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    strapi.log.debug(`[Record Locking] Client connected: ${socket.id}`);

    socket.on('openEntity', async (payload: unknown) => {
      if (!validateEntityPayload(payload)) {
        strapi.log.warn('[Record Locking] Invalid openEntity payload', { payload });
        return;
      }

      const { entityDocumentId, entityId } = payload;
      const userId = socket.data.userId;

      try {
        // Check user permissions
        const permissions = await strapi.db.connection
          .select('p.id', 'p.action', 'p.subject')
          .from('admin_permissions AS p')
          .innerJoin('admin_permissions_role_lnk AS prl', 'p.id', 'prl.permission_id')
          .innerJoin('admin_users_roles_lnk AS url', 'prl.role_id', 'url.role_id')
          .where('url.user_id', userId)
          .andWhere('p.subject', entityId);

        const hasPermission = permissions.some((perm) =>
          ['create', 'update', 'delete', 'publish'].some((op) => perm.action.includes(op))
        );

        if (!hasPermission) {
          strapi.log.warn('[Record Locking] Insufficient permissions', {
            userId,
            entityId,
          });
          return;
        }

        // Create lock record
        await strapi.db.query('plugin::record-locking.open-entity').create({
          data: {
            user: String(userId),
            entityId,
            entityDocumentId,
            connectionId: socket.id,
          },
        });

        strapi.log.debug('[Record Locking] Entity locked', {
          userId,
          entityId,
          entityDocumentId,
        });

        // Notify other users about the lock
        socket.broadcast.emit('entityLocked', { entityId, entityDocumentId });
      } catch (error) {
        strapi.log.error('[Record Locking] Error in openEntity:', error);
      }
    });

    socket.on('closeEntity', async (payload: unknown) => {
      if (!validateClosePayload(payload)) {
        strapi.log.warn('[Record Locking] Invalid closeEntity payload', { payload });
        return;
      }

      const { entityId, entityDocumentId, userId } = payload;

      try {
        const deleted = await strapi.db.query('plugin::record-locking.open-entity').deleteMany({
          where: {
            user: String(userId),
            entityId,
            entityDocumentId,
          },
        });

        if (deleted.count > 0) {
          strapi.log.debug('[Record Locking] Entity unlocked', {
            userId,
            entityId,
            entityDocumentId,
          });

          // Notify other users about the unlock
          socket.broadcast.emit('entityUnlocked', { entityId, entityDocumentId });
        }
      } catch (error) {
        strapi.log.error('[Record Locking] Error in closeEntity:', error);
      }
    });

    socket.on('disconnect', async () => {
      try {
        const deleted = await strapi.db.query('plugin::record-locking.open-entity').deleteMany({
          where: {
            connectionId: socket.id,
          },
        });

        strapi.log.debug(`[Record Locking] Client disconnected: ${socket.id}`, {
          locksReleased: deleted.count || 0,
        });
      } catch (error) {
        strapi.log.error('[Record Locking] Error in disconnect:', error);
      }
    });
  });

  // Clean up any stale locks on startup
  strapi.db
    .query('plugin::record-locking.open-entity')
    .deleteMany()
    .then(() => {
      strapi.log.info('[Record Locking] Stale locks cleaned up');
    })
    .catch((error) => {
      strapi.log.error('[Record Locking] Failed to clean stale locks:', error);
    });

  strapiWithIO.io = io;
  strapi.log.info('[Record Locking] WebSocket server initialized');
};

export default bootstrap;
