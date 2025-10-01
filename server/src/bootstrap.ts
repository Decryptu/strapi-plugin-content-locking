// server/src/bootstrap.ts
import type { Core } from '@strapi/strapi';
import { Server } from 'socket.io';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  const io = new Server(strapi.server.httpServer);

  io.on('connection', (socket) => {
    socket.on('openEntity', async ({ entityDocumentId, entityId }) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          console.error('[Record Locking] No authentication token provided');
          socket.disconnect();
          return;
        }

        // Get the admin token service using Strapi 5 service API
        const tokenService = strapi.service('admin::token');

        if (!tokenService?.decodeJwtToken) {
          console.error('[Record Locking] Token service not available or method missing');
          socket.disconnect();
          return;
        }

        // Decode the JWT token
        const decoded = await tokenService.decodeJwtToken(token);

        // Handle both possible token structures
        const userId = decoded?.id || decoded?.payload?.id;

        if (!userId) {
          console.error('[Record Locking] Invalid token: no user ID found', { decoded });
          socket.disconnect();
          return;
        }

        // Check user permissions
        const usersPermissionsForThisContent = await strapi.db.connection
          .select('p.id', 'p.action', 'p.subject')
          .from('admin_permissions AS p')
          .innerJoin('admin_permissions_role_lnk AS prl', 'p.id', 'prl.permission_id')
          .innerJoin('admin_users_roles_lnk AS url', 'prl.role_id', 'url.role_id')
          .where('url.user_id', userId)
          .andWhere('p.subject', entityId);

        const userHasAdequatePermissions = usersPermissionsForThisContent.some((perm) =>
          ['create', 'delete', 'publish'].some((operation) => perm.action.includes(operation))
        );

        if (userHasAdequatePermissions) {
          await strapi.db.query('plugin::record-locking.open-entity').create({
            data: {
              user: String(userId),
              entityId,
              entityDocumentId,
              connectionId: socket.id,
            },
          });
        } else {
          console.warn('[Record Locking] User lacks adequate permissions', {
            userId,
            entityId,
            entityDocumentId,
          });
        }
      } catch (error) {
        console.error('[Record Locking] Error in openEntity:', error);
        socket.disconnect();
      }
    });

    socket.on('closeEntity', async ({ entityId, entityDocumentId, userId }) => {
      try {
        await strapi.db.query('plugin::record-locking.open-entity').deleteMany({
          where: {
            user: String(userId),
            entityId,
            entityDocumentId,
          },
        });
      } catch (error) {
        console.error('[Record Locking] Error in closeEntity:', error);
      }
    });

    socket.on('disconnect', async () => {
      try {
        await strapi.db.query('plugin::record-locking.open-entity').deleteMany({
          where: {
            connectionId: socket.id,
          },
        });
      } catch (error) {
        console.error('[Record Locking] Error in disconnect:', error);
      }
    });
  });

  // Clean up any stale locks on startup
  strapi.db.query('plugin::record-locking.open-entity').deleteMany();
  (strapi as any).io = io;
};

export default bootstrap;
