/// <reference types="vite/client" />

/**
 * vite.config.ts가 빌드·개발 시점에 주입하는 에셋 버전 해시.
 * AssetLoader가 에셋 URL 뒤에 `?v=`로 붙여 캐시를 무효화한다.
 */
declare module 'virtual:asset-version' {
  export const ASSET_VERSION: string;
}
