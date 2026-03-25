import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// import App from './App.tsx'
// import { SimpleUsage } from './SimpleUsage'
import { MediaUsage } from './MediaUsage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*<App />*/}
    {/*<SimpleUsage />*/}
    <MediaUsage />
  </StrictMode>,
)
