import { verifyToken } from "@clerk/clerk-sdk-node";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.split(" ")[1]; // Remove "Bearer"
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY, // use secretKey, not apiKey
    });
    req.userId = verifiedToken.sub;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};