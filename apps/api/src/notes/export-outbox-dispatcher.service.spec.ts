import { OutboxJobStatus } from '../generated/prisma/client';
import { ExportOutboxDispatcherService } from './export-outbox-dispatcher.service';

describe('ExportOutboxDispatcherService', () => {
  it('despacha una nueva generación aunque reutilice el mismo outbox', async () => {
    const prisma = {
      outboxJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExportOutboxDispatcherService(
      prisma as never,
      queue as never,
      {} as never,
    );
    const dispatchOne = service['dispatchOne'].bind(service);

    await dispatchOne({
      id: 'outbox-reutilizado',
      payload: { artifactId: 'artifact', dispatchId: 'generacion-1' },
      status: OutboxJobStatus.PENDING,
      attempts: 0,
    });
    await dispatchOne({
      id: 'outbox-reutilizado',
      payload: { artifactId: 'artifact', dispatchId: 'generacion-2' },
      status: OutboxJobStatus.PENDING,
      attempts: 0,
    });

    expect(queue.enqueue).toHaveBeenNthCalledWith(1, {
      artifactId: 'artifact',
      dispatchId: 'generacion-1',
    });
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, {
      artifactId: 'artifact',
      dispatchId: 'generacion-2',
    });
  });
});
