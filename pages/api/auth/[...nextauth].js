import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import mongoose from "mongoose";
import User from "../../../models/User";
import { createUUID } from "@/components/createUUID";

mongoose.connect(process.env.MONGODB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const { email } = user;
      const existingUser = await User.findOne({ email });
      let secret = null;
      if (!existingUser) {
        console.log("User does not exist, creating a new user", email);
        secret = createUUID();
        const newUser = new User({ email, secret });
        await newUser.save();
      }

      return true;
    },
    jwt: async (token, user) => {
      const email = token?.token?.email;
      let output ={};
      if(email) {
        const userDb = await User.findOne({
          email,
        });
        if (userDb) {
          output = { secret: userDb.secret, username: userDb.username, email: userDb.email };
        }
      }
      return output;
    },
    async session(session, token) {
      return session;
    },
  },
});

