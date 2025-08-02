import mongoose from "mongoose";
const snippetSchema = new mongoose.Schema({
  title: String,
  language: String,
  content: String,
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
});

const Snippet = mongoose.model("Snippet", snippetSchema);

export default Snippet;