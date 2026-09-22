import React from 'react'
import { ContextProvider } from "../context/ContextProvider"
const Navber=({view,setView})=>{
    const { register ,user ,loader,logout } = React.useContext(ContextProvider);
    const userRegister =() =>{
        register();
    };
    const userLogout =()=>{
        logout();
    }
    const checkuser =() =>{
        return !loader ? 
        (
            user ? (
            <div className="navber__links">
                <li>
                    <span className="navber__img">
                        <img src={user.photoURL} alt=""/>
                    </span>
                </li>
                <li>
                    <button className="navber__btn" onClick= {userLogout}>
                     Logout
                    </button>
                </li>{""}
            </div>
        ):(
            <div className="navber__links">
                <li>
                    <button className="navber__btn" onClick={userRegister}>
                       Register With Google
                    </button>
                </li>
            </div>
        )
        ): (
            "..."
        )

    }
    return(
        <div className="navber">
            <div className="navber__container">
                <div className="navber__logo">
                    Messenger
                </div>
                <div className="navber__tabs">
                    <button
                        className={`navber__tab ${view === 'chat' ? 'navber__tab--active' : ''}`}
                        onClick={() => setView('chat')}
                    >
                        Chat
                    </button>
                    <button
                        className={`navber__tab ${view === 'signals' ? 'navber__tab--active' : ''}`}
                        onClick={() => setView('signals')}
                    >
                        Trading Signals
                    </button>
                </div>
               {checkuser()}
            </div>

        </div>
    )
}

export default Navber