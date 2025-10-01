// server/src/destroy.ts
import type { Core } from '@strapi/strapi';
import type { StrapiWithIO } from './types/strapi';

const destroy = async ({ strapi }: { strapi: Core.Strapi }) => {
  const strapiWithIO = strapi as StrapiWithIO;

  try {
    // Close Socket.IO server
    if (strapiWithIO.io?.close) {
      await new Promise<void>((resolve, reject) => {
        const io = strapiWithIO.io;
        if (io) {
          io.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          resolve();
        }
      });
      strapi.log.info('[Record Locking] WebSocket server closed');
    }

    // Clean up all lock records
    await strapi.db.query('plugin::record-locking.open-entity').deleteMany();
    strapi.log.info('[Record Locking] All locks cleaned up');
  } catch (error) {
    strapi.log.error('[Record Locking] Error during cleanup:', error);
  }
};

export default destroy;
