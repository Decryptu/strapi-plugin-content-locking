// server/src/controllers/controller.ts
import type { Core } from '@strapi/strapi';
import DEFAULT_TRANSPORTS from '../constants/transports';

interface LockStatus {
  editedBy: string;
}

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getSettings(ctx) {
    try {
      const settings = {
        transports: strapi.plugin('record-locking').config('transports') || DEFAULT_TRANSPORTS,
      };

      ctx.send(settings);
    } catch (error) {
      strapi.log.error('[Record Locking] Error getting settings:', error);
      ctx.throw(500, 'Failed to get settings');
    }
  },

  async getStatusBySlug(ctx) {
    const { entityDocumentId } = ctx.request.params;

    if (!entityDocumentId || typeof entityDocumentId !== 'string') {
      return ctx.badRequest('Invalid entityDocumentId');
    }

    try {
      const { id: userId } = ctx.state.user;

      const data = await strapi.db.query('plugin::record-locking.open-entity').findOne({
        where: {
          entityDocumentId,
          user: {
            $ne: String(userId),
          },
        },
      });

      if (!data) {
        return ctx.send(false);
      }

      const user = await strapi.db.query('admin::user').findOne({
        where: { id: data.user },
        select: ['firstname', 'lastname'],
      });

      if (!user) {
        strapi.log.warn('[Record Locking] Lock exists but user not found', {
          lockUserId: data.user,
        });
        return ctx.send(false);
      }

      const response: LockStatus = {
        editedBy: `${user.firstname} ${user.lastname}`,
      };

      return ctx.send(response);
    } catch (error) {
      strapi.log.error('[Record Locking] Error in getStatusBySlug:', error);
      ctx.throw(500, 'Failed to get lock status');
    }
  },

  async getStatusByIdAndSlug(ctx) {
    const { entityId, entityDocumentId } = ctx.request.params;

    if (!entityId || !entityDocumentId) {
      return ctx.badRequest('Missing required parameters');
    }

    try {
      const { id: userId } = ctx.state.user;

      const data = await strapi.db.query('plugin::record-locking.open-entity').findOne({
        where: {
          entityDocumentId,
          entityId,
          user: {
            $ne: String(userId),
          },
        },
      });

      if (!data) {
        return ctx.send(false);
      }

      const user = await strapi.db.query('admin::user').findOne({
        where: { id: data.user },
        select: ['firstname', 'lastname'],
      });

      if (!user) {
        return ctx.send(false);
      }

      const response: LockStatus = {
        editedBy: `${user.firstname} ${user.lastname}`,
      };

      return ctx.send(response);
    } catch (error) {
      strapi.log.error('[Record Locking] Error in getStatusByIdAndSlug:', error);
      ctx.throw(500, 'Failed to get lock status');
    }
  },

  async setStatusByIdAndSlug(ctx) {
    const { entityId, entityDocumentId } = ctx.request.params;

    if (!entityId || !entityDocumentId) {
      return ctx.badRequest('Missing required parameters');
    }

    try {
      const { id: userId } = ctx.state.user;

      // Check if already locked by another user
      const existingLock = await strapi.db.query('plugin::record-locking.open-entity').findOne({
        where: {
          entityDocumentId,
          entityId,
          user: {
            $ne: String(userId),
          },
        },
      });

      if (existingLock) {
        return ctx.conflict('Entity is already locked by another user');
      }

      await strapi.db.query('plugin::record-locking.open-entity').create({
        data: {
          user: String(userId),
          entityId,
          entityDocumentId,
          connectionId: null, // REST API lock, no socket connection
        },
      });

      return ctx.send(true);
    } catch (error) {
      strapi.log.error('[Record Locking] Error in setStatusByIdAndSlug:', error);
      ctx.throw(500, 'Failed to set lock status');
    }
  },

  async deleteStatusByIdAndSlug(ctx) {
    const { entityId, entityDocumentId } = ctx.request.params;

    if (!entityId || !entityDocumentId) {
      return ctx.badRequest('Missing required parameters');
    }

    try {
      const { id: userId } = ctx.state.user;

      await strapi.db.query('plugin::record-locking.open-entity').deleteMany({
        where: {
          user: String(userId),
          entityId,
          entityDocumentId,
        },
      });

      return ctx.send({ message: 'Lock deleted successfully' });
    } catch (error) {
      strapi.log.error('[Record Locking] Error in deleteStatusByIdAndSlug:', error);
      ctx.throw(500, 'Failed to delete lock status');
    }
  },
});

export default controller;
