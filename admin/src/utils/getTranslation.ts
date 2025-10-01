// admin/src/utils/getTranslation.ts
import { PLUGIN_ID } from '../pluginId';

const getTranslation = (id: string) => `${PLUGIN_ID}.${id}`;

export { getTranslation };
