// server/src/content-types/open-entity.ts
export default {
  kind: 'collectionType',
  collectionName: 'open_entity',
  info: {
    singularName: 'open-entity',
    pluralName: 'open-entities',
    displayName: 'Open Entity',
    description: 'Tracks locked entities for the record locking plugin.',
  },
  options: {
    draftAndPublish: false,
  },
  pluginOptions: {
    'content-manager': {
      visible: false, // Hide from admin panel
    },
    'content-type-builder': {
      visible: false,
    },
  },
  attributes: {
    entityDocumentId: {
      type: 'string',
      required: true,
      configurable: false,
    },
    entityId: {
      type: 'string',
      required: true,
      configurable: false,
    },
    user: {
      type: 'string',
      required: true,
      configurable: false,
    },
    connectionId: {
      type: 'string',
      configurable: false,
    },
  },
  // Add database indexes for performance
  indexes: [
    {
      name: 'idx_entity_document',
      columns: ['entity_document_id', 'entity_id'],
    },
    {
      name: 'idx_connection',
      columns: ['connection_id'],
    },
    {
      name: 'idx_user',
      columns: ['user'],
    },
  ],
};
