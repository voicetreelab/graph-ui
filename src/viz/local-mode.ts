import type {IAGMode} from 'juggl-api';
import type {EventNames, EventObject, NodeSingular} from 'cytoscape';
import type {Juggl} from './visualization';
import type {NodeCollection} from 'cytoscape';
import type {Menu} from 'obsidian';
import ToolbarLocal from '../ui/toolbar/ToolbarLocal.svelte';
import {Component, TFile} from 'obsidian';
import {VizId} from 'juggl-api';
import {
  CLASS_ACTIVE_NODE,
  CLASS_CONNECTED_ACTIVE_NODE,
  CLASS_INACTIVE_NODE,
} from '../constants';
import type {Core} from 'cytoscape';
import type {SvelteComponent} from 'svelte';
import {
  getLayoutSetting,
} from './layout-settings';


class EventRec {
    eventName: EventNames;
    selector: string;
    event: any;
}


// IMPORTANT CLAUDE, DON"T BOTHER MODIFYING ANYTHING HERE, WE ONLY USE juggl-main/src/viz/workspaces/workspace-mode.ts

export class LocalMode extends Component implements IAGMode {
    view;
    viz: Core;
    events: EventRec[] = [];
    windowEvent: any;
    toolbar: SvelteComponent;
    depth: number = 1;
    maxDepthForCurrentFile: number = 1;

    constructor(view: Juggl) {
      super();
      this.view = view;
    }


    onload() {
      if (this.view.vizReady) {
        this._onLoad();
      } else {
        this.registerEvent(this.view.on('vizReady', (viz) => {
          this._onLoad();
        }));
      }
    }

    _onLoad() {
      this.viz = this.view.viz;
      this.registerCyEvent('tap', 'node', async (e: EventObject) => {
        const id = VizId.fromNode(e.target);
        
        if (id.storeId === 'terminal') {
          // Handle terminal nodes - just open the terminal
          await this.view.plugin.openFileFromNode(e.target, e.originalEvent.metaKey);
          // Don't call onOpenFile for terminals since they don't have files
          return;
        }
        
        // Handle file nodes (existing logic)
        const file = await this.view.plugin.openFileFromNode(e.target, e.originalEvent.metaKey);
        if (file) {
          await this.onOpenFile(file);
        }
      });

      this.registerCyEvent('mouseover', 'node', async (e: EventObject) => {
        if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
            console.log('[Juggl Human] meta/ctrl');

          const id = VizId.fromNode(e.target);
          if (id.storeId === 'terminal') {
            await this.view.plugin.terminalStore.convertTerminalToHoverEditor(id.id, e.target);
          }
        }
      });

      // Register on file open event
      this.registerEvent(this.view.workspace.on('file-open', async (file) => {
        if (file) {
          await this.onOpenFile(file);
        }
      }));
    }

    async onOpenFile(file: TFile) {
      if (!this.view.settings.autoAddNodes) {
        return;
      }
      if (!this.viz) {
        console.warn('[Juggl Debug] local-mode onOpenFile - this.viz is null');
        return;
      }
      const id = new VizId(file.name, 'core');
      let node: NodeSingular;
      this.viz.startBatch();
      if (this.viz.$id(id.toId()).length === 0) {
        const nodeDef = await this.view.datastores.coreStore.get(id, this.view);
        if (!nodeDef) {
          this.viz.endBatch();
          return;
        }
        node = this.viz.add(nodeDef);
      } else {
        node = this.viz.$id(id.toId());
      }
      await this.view.expand(node, false);
      node.addClass(CLASS_ACTIVE_NODE);
      this.viz.nodes()
          .difference(node.closedNeighborhood())
          .remove();
      this.view.onGraphChanged(false);
      this.updateActiveFile(node as NodeSingular);
      this.viz.endBatch();
    }

    changeDepth(depth: number) {
        console.log(`changing depth to ${depth}`);

    }

    registerCyEvent(name: EventNames, selector: string, callback: any) {
      this.events.push({eventName: name, selector: selector, event: callback});
      if (selector) {
        this.viz.on(name, selector, callback);
      } else {
        this.viz.on(name, callback);
      }
    }

    onunload(): void {
      for (const listener of this.events) {
        if (listener.selector) {
          this.viz.off(listener.eventName, listener.selector, listener.event);
        } else {
          this.viz.off(listener.eventName, listener.event);
        }
      }
      this.events = [];
      this.toolbar.$destroy();
    }

    getName(): string {
      return 'local';
    }

    fillMenu(menu: Menu, nodes: NodeCollection): void {

    }

    createToolbar(element: Element) {
      const view = this.view;
      this.toolbar = new ToolbarLocal({
        target: element,
        props: {
          viz: this.viz,
          fitClick: this.view.fitView.bind(view),
          fdgdClick: () => this.view.setLayout(getLayoutSetting('force-directed', this.view.settings)),
          concentricClick: () => this.view.setLayout(getLayoutSetting('circle')),
          gridClick: () => this.view.setLayout(getLayoutSetting('grid')),
          hierarchyClick: () => this.view.setLayout(getLayoutSetting('hierarchy')),
          workspaceModeClick: () => view.setMode('workspace'),
          filterInput: (handler: InputEvent) => {
            // @ts-ignore
            this.view.searchFilter(handler.target.value);
            this.view.restartLayout();
          },
          onDepthChange: this.changeDepth,
          filterValue: this.view.settings.filter,
          workspace: this.view.plugin.app.workspace,
        },
      });
    }

    updateActiveFile(node: NodeCollection) {
      this.viz.elements()
          .removeClass([CLASS_CONNECTED_ACTIVE_NODE, CLASS_ACTIVE_NODE, CLASS_INACTIVE_NODE])
          .difference(node.closedNeighborhood())
          .addClass(CLASS_INACTIVE_NODE);
      node.addClass(CLASS_ACTIVE_NODE);
      node.connectedEdges()
          .addClass(CLASS_CONNECTED_ACTIVE_NODE)
          .connectedNodes()
          .addClass(CLASS_CONNECTED_ACTIVE_NODE)
          .union(node);
    }
}
