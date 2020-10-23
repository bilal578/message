import React, { createContext,useEffect,useState } from "react";
import {auth,db} from "../config"

import firebase from "firebase"


export const ContextProvider = createContext();

const ContextFun=(props)=>{
    const [user,setUser] = useState(null);
    const [loader , setLoader]=useState(true)
    const [allMsg, setAllMsg]= useState([]);
    const register =()=>{
        const Provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(Provider).then((result)=>{
            firebase.auth().signInWithRedirect(Provider);
        })
    };
    const logout=()=>{
        auth.signOut().then(()=>{
setUser(null);
         });
        
    };
    const sendMessage=(msg)=>{
    db.collection("messages").add({
        msg,
        photo:user.photoURL,
        username:user.displayName,
        email:user.email,
        currentTime: new Date(),

    });
    };
    useEffect(()=>{
        auth.onAuthStateChanged(user =>{
            setUser(user);
            setLoader(false)
        })
    },[]);

    //fetch messages from firebase

    db.collection("messages")
    .orderBy("currentTime","desc")
    .onSnapshot((snp)=> {
        setAllMsg( 
            snp.docs.map((doc) =>({
            id:doc.id,
            ...doc.data(),
        }))
        );
    })
    
return( 
<ContextProvider.Provider value={{register , user ,loader,logout,sendMessage ,allMsg}}>
    {props.children}
    </ContextProvider.Provider>
);
}

export default ContextFun;