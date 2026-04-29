
import axios from "axios";


const newAxios= axios.create({
    baseURL: "https://67ece54e4387d9117bbb5fd2.mockapi.io/dashboard/"
});

newAxios.interceptors.request.use((config)=>{
    const token= sessionStorage.getItem("token");
    console.log(config);
    if(token){
        config.headers.Authorization = `Bearer ${token}`
    }
    return config;
}, (error)=>{
    return Promise.reject(error);
});

export default newAxios;

