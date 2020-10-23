import React from 'react'
import { ContextProvider } from "../context/ContextProvider"
const Navber=()=>{
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
               {checkuser()}
            </div>

        </div>
    )
}

export default Navber