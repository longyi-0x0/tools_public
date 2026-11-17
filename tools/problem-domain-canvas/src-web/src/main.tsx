import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 库的默认皮先引入，后面的 flow.css 才能整条覆盖它（顺序有意义）。
import '@xyflow/react/dist/style.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import './styles/canvas.css';
import './styles/flow.css';
import App from './App.tsx';
import { bootstrap } from './store/bootstrap.ts';

bootstrap();

const container = document.getElementById('root');
if (!container) throw new Error('缺 #root 容器');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
