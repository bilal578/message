import React, { useState } from 'react';
import Navber from "./components/Navber";
import './App.css';
import ContextFun from "./context/ContextProvider"
import Home from "./components/Home"
import TradingSignals from "./components/TradingSignals"

function App() {
  const [view, setView] = useState('chat');
  return (
   <ContextFun>
     <Navber view={view} setView={setView} />
     {view === 'chat' ? <Home /> : <TradingSignals />}
    </ContextFun>
  );
}

export default App;
