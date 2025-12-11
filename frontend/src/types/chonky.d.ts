/**
 * Chonky 类型声明补丁
 * 解决 React 18 与 Chonky (Material UI v4) 的类型兼容性问题
 */
import "chonky";

declare module "chonky" {
  import {ReactNode, ComponentType} from "react";
  import {ChonkyIconProps} from "chonky/dist/types/icons.types";

  export interface FileBrowserProps {
    files: FileData[];
    fileActions?: FileAction[];
    onFileAction?: (data: any) => void;
    iconComponent?: ComponentType<ChonkyIconProps>;
    disableDragAndDrop?: boolean;
    disableDefaultFileActions?: string[];
    defaultFileViewActionId?: string;
    children?: ReactNode;
  }
}

declare module "chonky-icon-fontawesome" {
  import {ComponentType} from "react";
  import {ChonkyIconProps} from "chonky/dist/types/icons.types";
  
  export const ChonkyIconFA: ComponentType<ChonkyIconProps>;
}
