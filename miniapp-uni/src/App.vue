<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { measureFrame } from './utils/app-frame'

onLaunch(() => {
  measureFrame()
})
</script>

<style lang="scss">
/* 令牌与基础层都是全局的：mp-weixin 里这段会编成 app.wxss */
@import './styles/tokens.scss';
@import './styles/base.scss';
</style>
