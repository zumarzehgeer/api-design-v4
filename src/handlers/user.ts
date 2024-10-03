import prisma from '../db';
import { comparePassword, createJWT, hashPassword } from '../modules/auth';

export async function createNewUser(req, res) {
  const user = prisma.user.create({
    data: {
      username: req.body.username,
      password: await hashPassword(req.body.password),
    },
  });

  const token = createJWT(user);

  res.json({ token });
}

export async function signIn(req, res) {
  const user = await prisma.user.findUnique({
    where: {
      username: req.body.username,
    },
  });

  const isValid = await comparePassword(req.body.password, user.password);

  if (!isValid) {
    res.status(401);
    res.json({
      message: 'Invalid user or password',
    });
    return;
  }
}
