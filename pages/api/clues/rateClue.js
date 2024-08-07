import { NextApiRequest, NextApiResponse } from 'next';
import Clue from '@/models/Clue';
import User from '@/models/User';

async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { clueId, rating, secret } = req.body;

      if (!clueId || !rating || !secret) {
        return res.status(400).json({ message: 'Missing clueId, rating, or secret' });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be an integer between 1 and 5' });
      }

      // Find the user by secret
      const user = await User.findOne({ secret });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if(!user.rated_clues) {
        user.rated_clues = new Map();
      }

      // Check if the user has already rated this clue
      if (user.rated_clues.has(clueId)) {
        return res.status(400).json({ message: 'You have already rated this clue' });
      }

      // Find the clue by ID
      const clue = await Clue.findById(clueId);
      if (!clue) {
        return res.status(404).json({ message: 'Clue not found' });
      }

      // Update the clue's rating and rating count
      clue.rating = ((clue.rating * clue.ratingCnt) + rating) / (clue.ratingCnt + 1);
      clue.ratingCnt += 1;
      await clue.save();

      // Update the user's rated_clues
      user.rated_clues.set(clueId, rating);
      await user.save();

      res.status(200).json({ message: 'Clue rated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error rating clue' });
    }
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;
