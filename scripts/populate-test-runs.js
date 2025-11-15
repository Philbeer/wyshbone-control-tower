// Test script to populate sample runs for testing the evaluator console UI

async function populateTestRuns() {
  const baseUrl = 'http://localhost:5000';
  
  const testRuns = [
    {
      appName: 'Wyshbone UI',
      status: 'success',
      logs: 'Build completed successfully\nAll tests passed\nDeployment ready',
      snapshot: { files: ['src/index.html', 'src/app.js'], loc: 1234 }
    },
    {
      appName: 'Wyshbone Supervisor',
      status: 'error',
      logs: 'ERROR: Database connection failed\nTimeout connecting to PostgreSQL\nRetrying...',
      snapshot: { files: ['server.py', 'config.yaml'], loc: 567 }
    },
    {
      appName: 'Wyshbone UI',
      status: 'success',
      logs: 'Linting passed\nBuild optimized\nBundle size: 245kb',
      snapshot: { files: ['src/index.html', 'src/app.js', 'src/styles.css'], loc: 1298 }
    }
  ];
  
  console.log('Creating test runs...');
  
  for (const run of testRuns) {
    try {
      const response = await fetch(`${baseUrl}/tower/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(run)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✓ Created run ${data.id} (${run.appName}, ${run.status})`);
      } else {
        console.error(`✗ Failed to create run: ${await response.text()}`);
      }
    } catch (err) {
      console.error(`✗ Error creating run:`, err.message);
    }
  }
  
  console.log('\nDone! View runs at http://localhost:5000/dashboard');
}

populateTestRuns();
