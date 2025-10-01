// server/src/types/strapi.ts
import type { Core } from '@strapi/strapi';
import type { Server } from 'socket.io';

export interface StrapiWithIO extends Core.Strapi {
  io?: Server;
}
