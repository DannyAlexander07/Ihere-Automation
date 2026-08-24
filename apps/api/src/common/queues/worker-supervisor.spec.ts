import { WorkerSupervisor } from './worker-supervisor';

describe('WorkerSupervisor', () => {
  afterEach(() => jest.useRealTimers());

  it('reactiva un trabajador cuyo ciclo terminó inesperadamente', async () => {
    jest.useFakeTimers();
    let running = false;
    const worker = {
      close: jest.fn(() => Promise.resolve()),
      isPaused: jest.fn(() => false),
      isRunning: jest.fn(() => running),
      run: jest.fn(async () => {
        running = true;
        await Promise.resolve();
        running = false;
      }),
    };
    const logger = { error: jest.fn(), warn: jest.fn() };
    const supervisor = new WorkerSupervisor(worker, logger, 'Trabajador', 100);

    supervisor.start();
    await Promise.resolve();
    expect(worker.run).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(100);
    expect(worker.run).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Trabajador se detuvo; se intentará reactivar automáticamente.',
    );

    await supervisor.close();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
