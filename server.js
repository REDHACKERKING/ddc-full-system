
import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SECRET = "CHANGE_ME";
const app = express();
app.use(cors());
app.use(express.json());
const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    stock INTEGER,
    active INTEGER,
    minecraft_cmd TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    total_amount INTEGER,
    status TEXT,
    evidence TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor INTEGER,
    action TEXT,
    target TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.get("SELECT * FROM users WHERE username='admin'", [], (e,row)=>{
    if(!row){
      db.run("INSERT INTO users (username,password,role) VALUES ('admin', ?, 'admin')",
        [bcrypt.hashSync("admin123",10)]);
      console.log("Default admin: admin / admin123");
    }
  });
});

function log(actor, action, target){
  db.run("INSERT INTO audit_logs (actor,action,target) VALUES (?,?,?)",[actor,action,target]);
}

function auth(req,res,next){
  const h=req.headers.authorization;
  if(!h) return res.sendStatus(401);
  try{
    req.user = jwt.verify(h.split(" ")[1], SECRET);
    next();
  }catch{ res.sendStatus(403); }
}
function admin(req,res,next){
  if(req.user.role!=="admin") return res.sendStatus(403);
  next();
}

// ---------- AUTH ----------
app.post("/api/register",(req,res)=>{
  const {username,password}=req.body;
  const hash=bcrypt.hashSync(password,10);
  db.run("INSERT INTO users (username,password,role) VALUES (?,?, 'user')",
    [username,hash],
    ()=>res.json({success:true})
  );
});

app.post("/api/login",(req,res)=>{
  const {username,password}=req.body;
  db.get("SELECT * FROM users WHERE username=?",[username],(e,u)=>{
    if(!u||!bcrypt.compareSync(password,u.password))
      return res.status(401).json({error:"invalid"});
    const token=jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"2h"});
    res.json({token,role:u.role});
  });
});

app.post("/api/password/change",auth,(req,res)=>{
  const hash=bcrypt.hashSync(req.body.new_password,10);
  db.run("UPDATE users SET password=? WHERE id=?",[hash,req.user.id]);
  log(req.user.id,"CHANGE_PASSWORD","self");
  res.json({success:true});
});

// ---------- PRODUCTS ----------
app.get("/api/products",(req,res)=>{
  db.all("SELECT * FROM products WHERE active=1",[],(e,r)=>res.json(r));
});

app.post("/api/admin/product",auth,admin,(req,res)=>{
  const {name,price,stock,minecraft_cmd}=req.body;
  db.run(
    "INSERT INTO products (name,price,stock,active,minecraft_cmd) VALUES (?,?,?,1,?)",
    [name,price,stock,minecraft_cmd]
  );
  log(req.user.id,"ADD_PRODUCT",name);
  res.json({success:true});
});

// ---------- ORDERS ----------
app.post("/api/order",auth,(req,res)=>{
  const {items,evidence}=req.body;
  let total=0;
  items.forEach(i=>total+=i.price*i.qty);
  db.run(
    "INSERT INTO orders (user_id,total_amount,status,evidence) VALUES (?,?, 'pending', ?)",
    [req.user.id,total,evidence],
    function(){
      items.forEach(i=>{
        db.run("INSERT INTO order_items (order_id,product_id,quantity) VALUES (?,?,?)",
          [this.lastID,i.id,i.qty]);
      });
      res.json({success:true});
    }
  );
});

app.get("/api/admin/orders",auth,admin,(req,res)=>{
  db.all("SELECT * FROM orders WHERE status='pending'",[],(e,r)=>res.json(r));
});

app.patch("/api/admin/orders/:id/confirm",auth,admin,(req,res)=>{
  const id=req.params.id;
  db.run("UPDATE orders SET status='paid' WHERE id=?",[id]);
  db.all("SELECT * FROM order_items WHERE order_id=?",[id],(e,items)=>{
    items.forEach(i=>{
      db.run("UPDATE products SET stock=stock-? WHERE id=? AND stock!=-1",[i.quantity,i.product_id]);
      // Minecraft hook (placeholder)
      console.log("EXECUTE MC CMD for product", i.product_id);
    });
  });
  log(req.user.id,"CONFIRM_ORDER",id);
  res.json({success:true});
});

app.patch("/api/admin/orders/:id/reject",auth,admin,(req,res)=>{
  db.run("UPDATE orders SET status='rejected' WHERE id=?",[req.params.id]);
  log(req.user.id,"REJECT_ORDER",req.params.id);
  res.json({success:true});
});

app.get("/api/admin/audit",auth,admin,(req,res)=>{
  db.all("SELECT * FROM audit_logs ORDER BY created_at DESC",[],(e,r)=>res.json(r));
});

app.listen(3000,()=>console.log("Backend v3 running http://localhost:3000"));
