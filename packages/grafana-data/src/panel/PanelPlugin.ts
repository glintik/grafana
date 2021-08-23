import {
  FieldConfigSource,
  GrafanaPlugin,
  PanelEditorProps,
  PanelMigrationHandler,
  PanelPluginMeta,
  PanelProps,
  PanelTypeChangedHandler,
  FieldConfigProperty,
  PanelPluginDataSupport,
  PanelOptionsEditorItem,
} from '../types';
import { FieldConfigEditorBuilder, PanelOptionsEditorBuilder } from '../utils/OptionsUIBuilders';
import { ComponentClass, ComponentType } from 'react';
import { set, isEqual } from 'lodash';
import { deprecationWarning } from '../utils';
import { FieldConfigOptionsRegistry } from '../field';
import { createFieldConfigRegistry } from './registryFactories';

/** @beta */
export type StandardOptionConfig = {
  defaultValue?: any;
  settings?: any;
};

/** @beta */
export interface SetFieldConfigOptionsArgs<TFieldConfigOptions = any> {
  /**
   * Configuration object of the standard field config properites
   *
   * @example
   * ```typescript
   * {
   *   standardOptions: {
   *     [FieldConfigProperty.Decimals]: {
   *       defaultValue: 3
   *     }
   *   }
   * }
   * ```
   */
  standardOptions?: Partial<Record<FieldConfigProperty, StandardOptionConfig>>;

  /**
   * Array of standard field config properties that should not be available in the panel
   * @example
   * ```typescript
   * {
   *   disableStandardOptions: [FieldConfigProperty.Min, FieldConfigProperty.Max, FieldConfigProperty.Unit]
   * }
   * ```
   */
  disableStandardOptions?: FieldConfigProperty[];

  /**
   * Function that allows custom field config properties definition.
   *
   * @param builder
   *
   * @example
   * ```typescript
   * useCustomConfig: builder => {
   *   builder
   *    .addNumberInput({
   *      id: 'shapeBorderWidth',
   *      name: 'Border width',
   *      description: 'Border width of the shape',
   *      settings: {
   *        min: 1,
   *        max: 5,
   *      },
   *    })
   *    .addSelect({
   *      id: 'displayMode',
   *      name: 'Display mode',
   *      description: 'How the shape shout be rendered'
   *      settings: {
   *      options: [{value: 'fill', label: 'Fill' }, {value: 'transparent', label: 'Transparent }]
   *    },
   *  })
   * }
   * ```
   */
  useCustomConfig?: (builder: FieldConfigEditorBuilder<TFieldConfigOptions>) => void;
}

export class PanelPlugin<
  TOptions = any,
  TFieldConfigOptions extends object = any
> extends GrafanaPlugin<PanelPluginMeta> {
  private _defaults?: TOptions;
  private _defaultsFromOptions?: TOptions;
  private _fieldConfigDefaults: FieldConfigSource<TFieldConfigOptions> = {
    defaults: {},
    overrides: [],
  };

  private _fieldConfigRegistry?: FieldConfigOptionsRegistry;
  private _initConfigRegistry = () => {
    return new FieldConfigOptionsRegistry();
  };

  private registerOptionEditors?: (builder: PanelOptionsEditorBuilder<TOptions>, current: TOptions) => void;

  panel: ComponentType<PanelProps<TOptions>> | null;
  editor?: ComponentClass<PanelEditorProps<TOptions>>;
  onPanelMigration?: PanelMigrationHandler<TOptions>;
  onPanelTypeChanged?: PanelTypeChangedHandler<TOptions>;
  noPadding?: boolean;
  dataSupport: PanelPluginDataSupport = {
    annotations: false,
    alertStates: false,
  };

  /**
   * Legacy angular ctrl.  If this exists it will be used instead of the panel
   */
  angularPanelCtrl?: any;

  constructor(panel: ComponentType<PanelProps<TOptions>> | null) {
    super();
    this.panel = panel;
  }

  get defaults() {
    if (!this._defaultsFromOptions) {
      const result = this._defaults || {};
      if (!this._defaults) {
        const editors = this.getOptionsEditors(undefined as any);

        if (!editors || editors.length === 0) {
          return null;
        }

        for (const editor of editors) {
          set(result, editor.id, editor.defaultValue);
        }
      }
      this._defaultsFromOptions = result as TOptions;
    }
    return this._defaultsFromOptions;
  }

  get fieldConfigDefaults(): FieldConfigSource<TFieldConfigOptions> {
    const configDefaults = this._fieldConfigDefaults.defaults;
    configDefaults.custom = {} as TFieldConfigOptions;

    for (const option of this.fieldConfigRegistry.list()) {
      if (option.defaultValue === undefined) {
        continue;
      }

      set(configDefaults, option.id, option.defaultValue);
    }

    return {
      defaults: {
        ...configDefaults,
      },
      overrides: this._fieldConfigDefaults.overrides,
    };
  }

  /**
   * @deprecated setDefaults is deprecated in favor of setPanelOptions
   */
  setDefaults(defaults: TOptions) {
    deprecationWarning('PanelPlugin', 'setDefaults', 'setPanelOptions');
    this._defaults = defaults;
    return this;
  }

  get fieldConfigRegistry() {
    if (!this._fieldConfigRegistry) {
      this._fieldConfigRegistry = this._initConfigRegistry();
    }

    return this._fieldConfigRegistry;
  }

  private _optionDependencies?: Array<keyof TOptions>;
  private _lastOptionsItems?: PanelOptionsEditorItem[];
  private _lastOptions?: TOptions;

  /**
   * Returns the editor elements required for the current coptions.
   */
  getOptionsEditors(current: TOptions): PanelOptionsEditorItem[] {
    if (current && this._lastOptionsItems && this._lastOptions) {
      let same = true;
      if (this._optionDependencies && current !== this._lastOptions) {
        for (const k of this._optionDependencies) {
          const a = current[k];
          const b = this._lastOptions[k];
          if (!isEqual(a, b)) {
            same = false;
            break;
          }
        }
      }
      if (same) {
        return this._lastOptionsItems;
      }
    }

    const builder = new PanelOptionsEditorBuilder<TOptions>();
    if (this.registerOptionEditors) {
      this.registerOptionEditors(builder, current);
      this._optionDependencies = builder.getDependencies();
    }
    if (current) {
      this._lastOptions = current;
      return (this._lastOptionsItems = builder.getItems());
    }
    return builder.getItems();
  }

  /**
   * @deprecated setEditor is deprecated in favor of setPanelOptions
   */
  setEditor(editor: ComponentClass<PanelEditorProps<TOptions>>) {
    deprecationWarning('PanelPlugin', 'setEditor', 'setPanelOptions');
    this.editor = editor;
    return this;
  }

  setNoPadding() {
    this.noPadding = true;
    return this;
  }

  /**
   * This function is called before the panel first loads if
   * the current version is different than the version that was saved.
   *
   * This is a good place to support any changes to the options model
   */
  setMigrationHandler(handler: PanelMigrationHandler<TOptions>) {
    this.onPanelMigration = handler;
    return this;
  }

  /**
   * This function is called when the visualization was changed. This
   * passes in the panel model for previous visualisation options inspection
   * and panel model updates.
   *
   * This is useful for supporting PanelModel API updates when changing
   * between Angular and React panels.
   */
  setPanelChangeHandler(handler: PanelTypeChangedHandler) {
    this.onPanelTypeChanged = handler;
    return this;
  }

  /**
   * Enables panel options editor creation
   *
   * @example
   * ```typescript
   *
   * import { ShapePanel } from './ShapePanel';
   *
   * interface ShapePanelOptions {}
   *
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *   .setPanelOptions(builder => {
   *     builder
   *       .addSelect({
   *         id: 'shape',
   *         name: 'Shape',
   *         description: 'Select shape to render'
   *         settings: {
   *           options: [
   *             {value: 'circle', label: 'Circle' },
   *             {value: 'square', label: 'Square },
   *             {value: 'triangle', label: 'Triangle }
   *            ]
   *         },
   *       })
   *   })
   * ```
   *
   * @public
   **/
  setPanelOptions(builder: (builder: PanelOptionsEditorBuilder<TOptions>, current: TOptions) => void) {
    // builder is applied lazily when options UI is created
    this.registerOptionEditors = builder;
    return this;
  }

  /**
   * Tells Grafana if the plugin should subscribe to annotation and alertState results.
   *
   * @example
   * ```typescript
   *
   * import { ShapePanel } from './ShapePanel';
   *
   * interface ShapePanelOptions {}
   *
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *     .useFieldConfig({})
   *     ...
   *     ...
   *     .setDataSupport({
   *       annotations: true,
   *       alertStates: true,
   *     });
   * ```
   *
   * @public
   **/
  setDataSupport(support: Partial<PanelPluginDataSupport>) {
    this.dataSupport = { ...this.dataSupport, ...support };
    return this;
  }

  /**
   * Allows specifying which standard field config options panel should use and defining default values
   *
   * @example
   * ```typescript
   *
   * import { ShapePanel } from './ShapePanel';
   *
   * interface ShapePanelOptions {}
   *
   * // when plugin should use all standard options
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *  .useFieldConfig();
   *
   * // when plugin should only display specific standard options
   * // note, that options will be displayed in the order they are provided
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *  .useFieldConfig({
   *    standardOptions: [FieldConfigProperty.Min, FieldConfigProperty.Max]
   *   });
   *
   * // when standard option's default value needs to be provided
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *  .useFieldConfig({
   *    standardOptions: [FieldConfigProperty.Min, FieldConfigProperty.Max],
   *    standardOptionsDefaults: {
   *      [FieldConfigProperty.Min]: 20,
   *      [FieldConfigProperty.Max]: 100
   *    }
   *  });
   *
   * // when custom field config options needs to be provided
   * export const plugin = new PanelPlugin<ShapePanelOptions>(ShapePanel)
   *  .useFieldConfig({
   *    useCustomConfig: builder => {
   *      builder
   *       .addNumberInput({
   *         id: 'shapeBorderWidth',
   *         name: 'Border width',
   *         description: 'Border width of the shape',
   *         settings: {
   *           min: 1,
   *           max: 5,
   *         },
   *       })
   *       .addSelect({
   *         id: 'displayMode',
   *         name: 'Display mode',
   *         description: 'How the shape shout be rendered'
   *         settings: {
   *         options: [{value: 'fill', label: 'Fill' }, {value: 'transparent', label: 'Transparent }]
   *       },
   *     })
   *   },
   *  });
   *
   * ```
   *
   * @public
   */
  useFieldConfig(config: SetFieldConfigOptionsArgs<TFieldConfigOptions> = {}) {
    // builder is applied lazily when custom field configs are accessed
    this._initConfigRegistry = () => createFieldConfigRegistry(config, this.meta.name);

    return this;
  }
}
