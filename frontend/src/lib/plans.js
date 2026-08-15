export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    range: '50 – 100 employees',
    price: 'NPR 199',
    per: 'per employee / month',
    features: [
      '100+ phishing templates',
      '1 campaign per month',
      'Human-risk dashboard',
      'Automated micro-training',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    range: '100 – 250 employees',
    price: 'NPR 149',
    per: 'per employee / month',
    features: [
      'Everything in Starter',
      '5 campaigns per month',
      'Custom phishing templates',
      'Department analytics',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    range: '250+ employees',
    price: 'NPR 1199',
    per: 'per employee / year',
    features: [
      'Everything in Growth',
      'Unlimited campaigns',
      'Dedicated account manager',
      'SSO & custom domains',
      '24/7 phone support',
    ],
  },
];

export function findPlan(id) {
  return PLANS.find((p) => p.id === id);
}

export function recommendedFor(count) {
  if (count < 100) return 'starter';
  if (count < 250) return 'growth';
  return 'enterprise';
}

export function planPrice(planId, employeeCount) {
  const plan = findPlan(planId);
  if (!plan) return 0;
  const rate = parseInt(plan.price.replace(/\D/g, ''), 10) || 0;
  return rate * (employeeCount || 0);
}
