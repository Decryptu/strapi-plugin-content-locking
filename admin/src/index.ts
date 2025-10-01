// admin/src/index.ts
import EntityLock from './components/EntityLock';
import { Initializer } from './components/Initializer';
import { PLUGIN_ID } from './pluginId';

type TradOptions = Record<string, string>;

const prefixPluginTranslations = (trad: TradOptions, pluginId: string): TradOptions => {
  if (!pluginId) {
    throw new TypeError("pluginId can't be empty");
  }
  return Object.keys(trad).reduce((acc, current) => {
    acc[`${pluginId}.${current}`] = trad[current];
    return acc;
  }, {} as TradOptions);
};

interface RegisterApp {
  registerPlugin: (config: {
    id: string;
    initializer: typeof Initializer;
    isReady: boolean;
    name: string;
  }) => void;
}

interface BootstrapApp {
  getPlugin: (name: string) => {
    injectComponent: (
      view: string,
      position: string,
      config: { name: string; Component: typeof EntityLock }
    ) => void;
  };
}

interface RegisterTradsApp {
  locales: string[];
}

export default {
  register(app: RegisterApp) {
    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app: BootstrapApp) {
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'EntityLock',
      Component: EntityLock,
    });
  },

  async registerTrads(app: RegisterTradsApp) {
    const { locales } = app;

    const importedTranslations = await Promise.all(
      locales.map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, PLUGIN_ID),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return importedTranslations;
  },
};