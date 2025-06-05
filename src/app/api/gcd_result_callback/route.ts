// app/api/callback/route.ts (or pages/api/callback.ts for Pages Router)

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    console.log('Received callback:', body);
    
    const { success, result, error, taskId, metadata, timestamp } = body;
    
    if (!taskId) {
      console.error('Missing taskId in callback');
      return Response.json(
        { error: 'Missing taskId' },
        { status: 400 }
      );
    }

    if (success) {
      // Handle successful calculation
      console.log(`Task ${taskId} completed successfully. Result: ${result}`);
      
      // Store the result in your database
      await storeCalculationResult({
        taskId,
        result,
        status: 'completed',
        completedAt: new Date(),
        metadata
      });
      
      // You can also trigger other processes here
      // await notifyOtherServices(taskId, result);
      
    } else {
      // Handle calculation error
      console.error(`Task ${taskId} failed:`, error);
      
      // Store the error in your database
      await storeCalculationResult({
        taskId,
        error,
        status: 'failed',
        completedAt: new Date(),
        metadata
      });
      
      // You might want to trigger retry logic or notifications here
      // await handleCalculationFailure(taskId, error);
    }

    // Always return 200 to acknowledge receipt
    return Response.json({ 
      message: 'Callback processed successfully',
      taskId 
    });

  } catch (error) {
    console.error('Error processing callback:', error);
    
    // Return 500 so the Cloud Function can retry if needed
    return Response.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
}

// Example database storage function
async function storeCalculationResult(data: {
  taskId: string;
  result?: string;
  error?: string;
  status: 'completed' | 'failed';
  completedAt: Date;
  metadata?: any;
}) {
  // Replace this with your actual database logic
  //TODO: store the result in database
  console.log('Storing result:', data);
}
