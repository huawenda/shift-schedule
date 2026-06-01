/// <reference types="@tarojs/taro" />

declare const process: {
  env: {
    TARO_ENV?: string
    TARO_APP_SUPABASE_URL?: string
    TARO_APP_SUPABASE_ANON_KEY?: string
  }
}

declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    getFestivals(): string[]
    getLunar(): Lunar
  }

  export class Lunar {
    getDayInChinese(): string
    getMonthInChinese(): string
    getFestivals(): string[]
    getJieQi(): string
  }
}
