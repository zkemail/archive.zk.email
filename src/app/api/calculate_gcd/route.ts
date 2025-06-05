import { CloudTasksClient } from '@google-cloud/tasks';
const client = new CloudTasksClient();

// Configuration - these should come from environment variables
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
const LOCATION = process.env.GOOGLE_CLOUD_REGION || 'us-central1';
const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || '';
const FUNCTION_URL = process.env.CLOUD_FUNCTION_URL || '';
const SERVICE_ACCOUNT_EMAIL = process.env.TASKS_SERVICE_ACCOUNT_EMAIL;
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://sample-ngork.ngrok-free.app/api/gcd_result_callback'; // For local testing use ngork

export async function POST(request: { json: () => any }) {
  try {
    const body = await request.json();
    const { s1, s2, em1, em2, taskId, metadata } = body;

    // Validate required parameters
    if (!s1 || !s2 || !em1 || !em2) {
      return Response.json(
        { error: 'Missing required parameters: s1, s2, em1, em2' },
        { status: 400 }
      );
    }

    if (!CALLBACK_URL) {
      return Response.json(
        { error: 'CALLBACK_URL environment variable not set' },
        { status: 500 }
      );
    }

    //TODO: validation should be done here not in python function
    // Create task payload with callback information
    const payload = {
      s1: s1.toString(),
      s2: s2.toString(),
      em1: em1.toString(),
      em2: em2.toString(),
      callbackUrl: CALLBACK_URL,
      taskId: taskId || `task_${Date.now()}`,
      metadata: metadata || {} // Additional data you want to pass through
    };

    // Construct the fully qualified queue name
    const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

    // Create the task
    if (!SERVICE_ACCOUNT_EMAIL) {
      return Response.json(
        { error: 'TASKS_SERVICE_ACCOUNT_EMAIL environment variable not set' },
        { status: 500 }
      );
    }

    if (!SERVICE_ACCOUNT_EMAIL) {
      return Response.json(
        { error: 'TASKS_SERVICE_ACCOUNT_EMAIL environment variable not set' },
        { status: 500 }
      );
    }

     const task = {
       httpRequest: {
         httpMethod: 'POST' as const,
         url: FUNCTION_URL,
         headers: {
           'Content-Type': 'application/json',
         },
         body: Buffer.from(JSON.stringify(payload)),
         oidcToken: {
           serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
         },
       },
      name: taskId ? `${parent}/tasks/${taskId}` : undefined,
    };

    // Send the task
    const [response] = await client.createTask({ parent, task });

    console.log(`Created task ${response.name}`);

    // Return immediately - no polling needed
    return Response.json({
      success: true,
      taskName: response.name,
      taskId: payload.taskId,
      message: 'Task created successfully. Result will be sent to callback URL.',
    });

  } catch (error) {
    console.error('Error creating task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return Response.json(
      { error: 'Failed to create task', details: errorMessage },
      { status: 500 }
    );
  }
}