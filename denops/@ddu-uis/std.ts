import {
  ActionFlags,
  BaseUi,
  DduItem,
  DduOptions,
  UiOptions,
} from "../ddu/types.ts";
import { Denops, fn } from "../ddu/deps.ts";
import { ActionArguments } from "../ddu/base/ui.ts";

type DoActionParams = {
  name?: string;
  params?: unknown;
};

type Params = {
  startFilter: boolean;
};

export class Ui extends BaseUi<Params> {
  private filterBufnr = -1;
  private items: DduItem[] = [];
  private selectedItems: Set<number> = new Set();

  refreshItems(args: {
    items: DduItem[];
  }): void {
    // Note: Use only 1000 items
    this.items = args.items.slice(0, 1000);
    this.selectedItems.clear();
  }

  async redraw(args: {
    denops: Denops;
    options: DduOptions;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
    const bufferName = `ddu-std-${args.options.name}`;
    const exists = await fn.bufexists(args.denops, bufferName);
    const bufnr = exists
      ? await fn.bufnr(args.denops, bufferName)
      : await this.initBuffer(args.denops, bufferName);

    await fn.setbufvar(args.denops, bufnr, "&modifiable", 1);

    const ids = await fn.win_findbuf(args.denops, bufnr) as number[];
    if (ids.length == 0) {
      await args.denops.cmd(`buffer ${bufnr}`);
    }

    // Update main buffer
    await args.denops.call(
      "ddu#ui#std#update_buffer",
      bufnr,
      this.items.map(
        (c, i) => `${this.selectedItems.has(i) ? "*" : " "}${c.word}`,
      ),
    );

    await fn.setbufvar(args.denops, bufnr, "ddu_ui_name", args.options.name);

    const filterIds = await fn.win_findbuf(
      args.denops,
      this.filterBufnr,
    ) as number[];
    if (filterIds.length == 0 && args.uiParams.startFilter) {
      this.filterBufnr = await args.denops.call(
        "ddu#ui#std#filter#_open",
        args.options.name,
        args.options.input,
        this.filterBufnr,
      ) as number;
    }
  }

  actions: Record<
    string,
    (args: ActionArguments<Params>) => Promise<ActionFlags>
  > = {
    doAction: async (args: {
      denops: Denops;
      options: DduOptions;
      actionParams: unknown;
    }) => {
      let items: DduItem[];
      if (this.selectedItems.size == 0) {
        const idx = (await fn.line(args.denops, ".")) - 1;
        items = [this.items[idx]];
      } else {
        items = [...this.selectedItems].map((i) => this.items[i]);
      }

      const params = args.actionParams as DoActionParams;
      await args.denops.call(
        "ddu#do_action",
        args.options.name,
        params.name ?? "default",
        items,
        params.params ?? {},
      );

      return Promise.resolve(ActionFlags.None);
    },
    toggleSelectItem: async (args: {
      denops: Denops;
      options: DduOptions;
      actionParams: unknown;
    }) => {
      const idx = (await fn.line(args.denops, ".")) - 1;
      if (this.selectedItems.has(idx)) {
        this.selectedItems.delete(idx);
      } else {
        this.selectedItems.add(idx);
      }

      return Promise.resolve(ActionFlags.Redraw);
    },
    openFilterWindow: async (args: {
      denops: Denops;
      options: DduOptions;
      actionParams: unknown;
    }) => {
      this.filterBufnr = await args.denops.call(
        "ddu#ui#std#filter#_open",
        args.options.name,
        args.options.input,
        this.filterBufnr,
      ) as number;

      return Promise.resolve(ActionFlags.None);
    },
  };

  params(): Params {
    return {
      startFilter: false,
    };
  }

  private async initBuffer(
    denops: Denops,
    bufferName: string,
  ): Promise<number> {
    const bufnr = await fn.bufadd(denops, bufferName);
    await fn.bufload(denops, bufnr);
    await denops.cmd(`buffer ${bufnr}`);
    const winid = await fn.win_getid(denops);

    // Set options
    await fn.setwinvar(denops, winid, "&conceallevel", 3);
    await fn.setwinvar(denops, winid, "&concealcursor", "inv");

    // Highlights
    await denops.cmd(
      "highlight default link dduStdSelectedLine Statement",
    );

    await fn.setbufvar(denops, bufnr, "&filetype", "ddu-std");

    await denops.cmd(
      `syntax match dduStdNormalLine /^[ ].*/` +
        " contains=dduStdConcealedMark",
    );
    await denops.cmd(
      `syntax match dduStdSelectedLine /^[*].*/` +
        " contains=dduStdConcealedMark",
    );
    await denops.cmd(
      `syntax match dduStdConcealedMark /^[ *]/` +
        " conceal contained",
    );

    return Promise.resolve(bufnr);
  }
}
