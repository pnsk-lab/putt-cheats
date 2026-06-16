type PuttAnyRecord = Record<string, any>;

declare global {
  interface Window {
    cc?: any;
    System?: {
      __puttSystemHooked?: boolean;
      import(specifier: string, ...args: any[]): Promise<any>;
    };
    puttCheats: PuttAnyRecord;
    puttModules?: PuttAnyRecord;
    puttKeybinds?: PuttAnyRecord;
    __puttUiContainer?: HTMLElement | null;
    __puttWsHookInstalled?: boolean;
    __puttLocalHealthTimer?: ReturnType<typeof setInterval> | null;
  }

  interface HTMLElement {
    checked?: boolean;
    disabled?: boolean;
    value?: string;
    width?: number;
    height?: number;
  }

  interface Element {
    checked?: boolean;
    disabled?: boolean;
    value?: string;
  }
}

export {};
