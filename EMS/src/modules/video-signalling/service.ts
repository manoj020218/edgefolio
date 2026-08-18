import { assertFound } from '../../lib/errors';
import { VideoSession } from './model';

export async function createSession(input: { sessionId: string; companyId: string; callerUserId: string; calleeUserId: string }) {
  return VideoSession.create(input);
}

export async function answerSession(companyId: string, id: string) {
  return assertFound(await VideoSession.findOneAndUpdate({ _id: id, companyId }, { status: 'answered', answeredAt: new Date() }, { new: true }), 'SESSION_NOT_FOUND', 'Video session not found');
}

export async function endSession(companyId: string, id: string) {
  return assertFound(await VideoSession.findOneAndUpdate({ _id: id, companyId }, { status: 'ended', endedAt: new Date() }, { new: true }), 'SESSION_NOT_FOUND', 'Video session not found');
}

export async function listSessions(companyId: string, userId: string) {
  return VideoSession.find({ companyId, $or: [{ callerUserId: userId }, { calleeUserId: userId }] }).sort({ createdAt: -1 }).lean();
}
