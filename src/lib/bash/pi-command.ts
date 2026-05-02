import { defineCommand } from 'just-bash';

export const piCommand = defineCommand('pi', async (args) => {
  const prompt = args.join(' ');
  
  if (!prompt) {
    return { stdout: 'usage: pi <prompt>\n   Example: pi "create a new component"\n', stderr: '', exitCode: 1 };
  }

  return new Promise((resolve) => {
    const requestId = Date.now().toString();
    
    const onDone = () => {
      window.removeEventListener(`agent-done-${requestId}`, onDone);
      window.removeEventListener(`agent-error-${requestId}`, onError);
      resolve({ stdout: '\n', stderr: '', exitCode: 0 }); 
    };
    
    const onError = () => {
      window.removeEventListener(`agent-done-${requestId}`, onDone);
      window.removeEventListener(`agent-error-${requestId}`, onError);
      resolve({ stdout: '', stderr: 'Agent error occurred.\n', exitCode: 1 });
    };

    window.addEventListener(`agent-done-${requestId}`, onDone);
    window.addEventListener(`agent-error-${requestId}`, onError);

    // Write thinking message natively
    window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\x1b[35m[Pi Agent] thinking...\x1b[0m\r\n` }));

    // Request generation from the App UI
    window.dispatchEvent(new CustomEvent('agent-request', { detail: { prompt, requestId } }));
  });
});
