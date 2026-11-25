export const scope = 'xironwood/ironwood-studio-pilot:main:intakeFee';
export const followUpVisits = 11;

export function validIntakeFee(amount) {
  return Number.isInteger(amount) && amount >= 0 && amount <= 500 && amount % 5 === 0;
}

export function readFees(source) {
  const fees = JSON.parse(source);
  if (!fees || Object.keys(fees).length !== 2 || !validIntakeFee(fees.intakeFee) ||
      !Number.isSafeInteger(fees.individualFee) || fees.individualFee < 0 || fees.individualFee > 500) {
    throw new Error('Expected an intake fee in $5 steps from $0 to $500 and a whole-dollar individual fee from $0 to $500.');
  }
  return fees;
}

export function estimate(fees) {
  return fees.intakeFee + followUpVisits * fees.individualFee;
}
