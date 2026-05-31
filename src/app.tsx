import { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { isH5Runtime } from './services/runtime'
import './app.scss'

if (!isH5Runtime) {
  Taro.cloud.init({
    env: 'cloud1-d4gs9jjiv5ea4276e'
  })
}

export default function App({ children }: PropsWithChildren) {
  return children
}
