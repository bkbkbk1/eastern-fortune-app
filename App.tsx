import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import React from 'react';
import FortuneWebView from './src/components/FortuneWebView';

export default function App() {
  return <FortuneWebView />;
}
