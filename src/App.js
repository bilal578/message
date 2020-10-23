import React from 'react';
import Navber from "./components/Navber";
import './App.css';
import ContextFun from "./context/ContextProvider"
import Home from "./components/Home"
function App() {
  return (
   <ContextFun>
     <Navber />
     <Home />
    </ContextFun>
  );
}

export default App;
