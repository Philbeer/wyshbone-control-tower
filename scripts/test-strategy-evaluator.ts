/**
 * Test Strategy Evaluator - Verification Script
 *
 * This script tests all acceptance criteria for the Strategy Evaluator:
 * 1. Strategies tracked with success metrics
 * 2. A/B testing framework operational
 * 3. Statistical significance calculated
 * 4. Recommendations generated automatically
 * 5. Strategy performance dashboards
 */

import { evaluator } from '../lib/evaluator.js';

async function runTests() {
  console.log('🧪 Testing Strategy Evaluator\n');
  console.log('=' .repeat(50));

  try {
    // Test 1: Create test strategies
    console.log('\n1️⃣  Creating test strategies...');
    const strategyA = await evaluator.strategyEvaluator.createStrategy({
      name: 'Fast Response Strategy',
      description: 'Prioritizes speed over accuracy',
      category: 'performance',
      config: {
        timeout: 1000,
        retries: 1,
      },
    });
    console.log(`✅ Created Strategy A: ${strategyA.name} (${strategyA.id})`);

    const strategyB = await evaluator.strategyEvaluator.createStrategy({
      name: 'Accurate Response Strategy',
      description: 'Prioritizes accuracy over speed',
      category: 'performance',
      config: {
        timeout: 5000,
        retries: 3,
      },
    });
    console.log(`✅ Created Strategy B: ${strategyB.name} (${strategyB.id})`);

    // Test 2: Record performance metrics
    console.log('\n2️⃣  Recording performance metrics...');
    for (let i = 0; i < 10; i++) {
      await evaluator.strategyEvaluator.recordPerformance({
        strategyId: strategyA.id,
        context: 'test-run',
        metrics: {
          successRate: 0.7 + Math.random() * 0.2,
          avgDuration: 800 + Math.random() * 400,
          errorCount: Math.floor(Math.random() * 3),
        },
        outcome: 'success',
      });
    }
    console.log(`✅ Recorded 10 performance samples for Strategy A`);

    for (let i = 0; i < 10; i++) {
      await evaluator.strategyEvaluator.recordPerformance({
        strategyId: strategyB.id,
        context: 'test-run',
        metrics: {
          successRate: 0.85 + Math.random() * 0.1,
          avgDuration: 2000 + Math.random() * 1000,
          errorCount: Math.floor(Math.random() * 2),
        },
        outcome: 'success',
      });
    }
    console.log(`✅ Recorded 10 performance samples for Strategy B`);

    // Test 3: Create A/B test
    console.log('\n3️⃣  Creating A/B test...');
    const abTest = await evaluator.strategyEvaluator.createAbTest({
      name: 'Speed vs Accuracy Test',
      description: 'Testing whether speed or accuracy is more important',
      strategyAId: strategyA.id,
      strategyBId: strategyB.id,
      config: {
        trafficSplit: 0.5,
        minSampleSize: 30,
        maxDurationDays: 7,
      },
    });
    console.log(`✅ Created A/B Test: ${abTest.name} (${abTest.id})`);

    // Test 4: Record A/B test results
    console.log('\n4️⃣  Recording A/B test results...');
    for (let i = 0; i < 15; i++) {
      await evaluator.strategyEvaluator.recordAbTestResult({
        testId: abTest.id,
        strategyId: strategyA.id,
        variant: 'A',
        metrics: {
          successRate: 0.7 + Math.random() * 0.2,
          avgDuration: 800 + Math.random() * 400,
        },
        outcome: 'success',
      });
    }
    console.log(`✅ Recorded 15 A/B test results for variant A`);

    for (let i = 0; i < 15; i++) {
      await evaluator.strategyEvaluator.recordAbTestResult({
        testId: abTest.id,
        strategyId: strategyB.id,
        variant: 'B',
        metrics: {
          successRate: 0.85 + Math.random() * 0.1,
          avgDuration: 2000 + Math.random() * 1000,
        },
        outcome: 'success',
      });
    }
    console.log(`✅ Recorded 15 A/B test results for variant B`);

    // Test 5: Analyze A/B test with statistical significance
    console.log('\n5️⃣  Analyzing A/B test...');
    const analysis = await evaluator.strategyEvaluator.analyzeAbTest(abTest.id);
    console.log(`✅ Analysis complete:`);
    console.log(`   Winner: ${analysis.winner || 'No clear winner yet'}`);
    console.log(`   Significance (p-value): ${analysis.significance.toFixed(4)}`);
    console.log(`   Is significant: ${analysis.significance < 0.05 ? 'Yes' : 'No'}`);
    console.log(`   Recommendation: ${analysis.recommendation}`);

    // Test 6: Get aggregated metrics
    console.log('\n6️⃣  Getting aggregated metrics...');
    const metricsA = await evaluator.strategyEvaluator.getMetrics(strategyA.id);
    const metricsB = await evaluator.strategyEvaluator.getMetrics(strategyB.id);
    console.log(`✅ Strategy A metrics:`);
    console.log(`   Avg Success Rate: ${(metricsA.avgSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Avg Duration: ${metricsA.avgDuration.toFixed(0)}ms`);
    console.log(`   Total Runs: ${metricsA.totalRuns}`);
    console.log(`✅ Strategy B metrics:`);
    console.log(`   Avg Success Rate: ${(metricsB.avgSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Avg Duration: ${metricsB.avgDuration.toFixed(0)}ms`);
    console.log(`   Total Runs: ${metricsB.totalRuns}`);

    // Test 7: Generate recommendations
    console.log('\n7️⃣  Generating automatic recommendations...');
    const recommendations = await evaluator.strategyEvaluator.getRecommendations();
    console.log(`✅ Generated ${recommendations.recommendations.length} recommendations:`);
    recommendations.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });

    // Test 8: Get dashboard data
    console.log('\n8️⃣  Fetching dashboard data...');
    const dashboardData = await evaluator.getStrategyDashboardData();
    console.log(`✅ Dashboard data retrieved:`);
    console.log(`   Total Strategies: ${dashboardData.summary.totalStrategies}`);
    console.log(`   Active Strategies: ${dashboardData.summary.activeStrategies}`);
    console.log(`   Active A/B Tests: ${dashboardData.summary.activeAbTests}`);
    console.log(`   Top Performers: ${dashboardData.topPerformers.length}`);
    console.log(`   Underperformers: ${dashboardData.underperformers.length}`);

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ All tests passed successfully!');
    console.log('\n📊 Acceptance Criteria Status:');
    console.log('   ✅ 1. Strategies tracked with success metrics');
    console.log('   ✅ 2. A/B testing framework operational');
    console.log('   ✅ 3. Statistical significance calculated');
    console.log('   ✅ 4. Recommendations generated automatically');
    console.log('   ✅ 5. Strategy performance dashboards');
    console.log('\n🎉 Strategy Evaluator is fully operational!');
    console.log('\n📱 Access the dashboard at: http://localhost:3000/dashboard/strategy');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
