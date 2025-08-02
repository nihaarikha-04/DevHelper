import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Snippet from "./models/Snippet.js";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/User.js"; 
import session from "express-session";
import MongoStore from "connect-mongo";

mongoose.connect(process.env.MONGODB_URI, {
  dbName: "devhelper"
}); 

import {GoogleGenAI} from '@google/genai';

const genai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const app = express();
const port = 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended: true}));
app.use(session({
  secret: process.env.PASSWORD,
  resave: false, //avoids unnecessary session saves
  saveUninitialized: false, //prevents creating empty sessions
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: "devhelper",
    collectionName: "sessions"
  }),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week is the time for which the session will be valid
  }
}));

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/add-snippet", (req, res) => {
  res.render("add");
});

app.get("/edit-snippet/:id", async (req, res) => {
  const snippetId = req.params.id;
  try {
    const snippet = await Snippet.findById(snippetId);
    res.render("edit", { snippet });
  }
  catch (err) {
    res.status(500).send("Error in fetching the snippet");
  }
});

app.get("/snippets", async (req, res) => {
  const tag = req.query.tag;
  try {
    if(!req.session.userId) {
      return res.redirect("/login");
    }
    let filter = { user: req.session.userId };
    if(tag) filter.tags = tag.toLowerCase();
    const snippets = await Snippet.find(filter).sort({ createdAt: -1 });
    res.render("snippets", { snippets, tag });
  }
  catch (err) {
    res.status(500).send("Error in fetching snippets"); 
  }
});

app.get("/generate", (req, res) => {
  if(!req.session.userId) {
    return res.redirect("/login");
  }
  res.render("generate", { prompt: "", snippetContent: "", userId: req.session.userId });
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if(err) {
      return res.status(500).send("Error in logging out");
    }
    res.redirect("/login");
  });
});

app.post("/register", async (req, res) => {
  const {username, password} = req.body;  
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).send("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword
    });
    await user.save();
    res.redirect("/login");
  }
  catch (err) {
    res.status(500).send("Error in registering the user");
  }
});

app.post("/login", async (req, res) => {
  const {username, password} = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).send("Invalid username or password");
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send("Invalid username or password");
    }
    req.session.userId = user._id;
    res.redirect("/snippets");
  } catch (err) {
    res.status(500).send("Error in logging in");
  }
});

app.post("/add-snippet", async (req, res) => {
  const {title, language, content, tags} = req.body;
  const tagArray = tags.split(",").map(tag => tag.trim().toLowerCase());
  try {
    if(!req.session.userId) {
      return res.status(401).send("You must be logged in to add a snippet");
    }
    await Snippet.create({
      title,
      language,
      content,
      tags: tagArray,
      user: req.session.userId
    });
    res.redirect("/snippets");
  } catch (err) {
    res.status(500).send("Error in saving the snippet");
  }
});

app.post("/save-snippet", async (req, res) => {
  const {title, language, content, tags} = req.body;
  if(!req.session.userId) {
    return res.status(401).send("You must be logged in to save a snippet");
  }
  const tagArray = tags.split(",").map(tag => tag.trim().toLowerCase());
  try {
    await Snippet.create({
      title,
      language,
      content,
      tags: tagArray,
      user: req.session.userId
    });
    res.redirect("/snippets");
  } catch (err) {
    res.status(500).send("Error in saving the snippet");
  }
});

app.post("/delete-snippet/:id", async (req, res) => {
  const snippetId = req.params.id;
  try {
    await Snippet.findByIdAndDelete(snippetId);
    res.redirect("/snippets");
  } catch (err) {
    res.status(500).send("Error in deleting the snippet");
  }
});

app.post("/edit-snippet/:id", async (req, res) => {
  const snippetId = req.params.id;
  const {title, language, content, tags} = req.body;
  const tagArray = tags.split(",").map(tag => tag.trim().toLowerCase());
  try {
    await Snippet.findByIdAndUpdate(snippetId, {
      title,
      language,
      content,
      tags: tagArray
    });
    res.redirect("/snippets");
  } catch (err) {
    res.status(500).send("Error in updating the snippet");
  }
});

app.post("/generate", async (req, res) => {
  const { prompt } = req.body;
  if(!req.session.userId) {
    return res.status(401).send("You must be logged in to generate a snippet");
  }
  if(!prompt || prompt.trim() === "") {
    return res.status(400).send("Prompt cannot be empty");
  }
  try {
    const response = await genai.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: prompt,
    });
    const snippetContent = response.text;
    res.render("generate", { prompt, snippetContent, userId: req.session.userId });
  } 
  catch (err) {
    console.error("Gemini error: ", err);
    res.status(500).send("Error in generating the snippet");
  }
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});