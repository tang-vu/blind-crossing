import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { ExpressPeerServer } from 'peer';
import express from 'express';
const app=express(), server=http.createServer(app);
const port=Number(process.env.PORT||4173);
app.use('/signal',ExpressPeerServer(server,{path:'/'}));
app.get('/room.html',async (_req,res,next)=>{
  try{
    const html=await readFile('dist/room.html','utf8');
    res.type('html').send(html.replace('<script type="module"','<script>globalThis.BC_LOCAL_SIGNAL=true</script><script type="module"'));
  } catch(e){next(e);}
});
app.use(express.static('dist'));
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Blind Crossing at http://'+(process.env.HOST||'127.0.0.1')+':'+port));
