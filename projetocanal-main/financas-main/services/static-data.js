const db = require('../database');

function getCountries() {
  return db.prepare('SELECT * FROM countries ORDER BY name').all();
}

function getCurrencies() {
  return db.prepare('SELECT * FROM currencies ORDER BY code').all();
}

function getCountry(code) {
  return db.prepare('SELECT * FROM countries WHERE code = ?').get(code);
}

function getCurrency(code) {
  return db.prepare('SELECT * FROM currencies WHERE code = ?').get(code);
}

function getPlans() {
  return db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort').all();
}

function getPlan(code) {
  return db.prepare('SELECT * FROM subscription_plans WHERE code = ?').get(code);
}

function getCategories(userId, type) {
  if (type) return getCategoriesByType(userId, type);
  return db.prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY type, is_default DESC, name').all(userId);
}

function getCategoriesByType(userId, type) {
  return db.prepare('SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = ? ORDER BY is_default DESC, name').all(userId, type);
}

function getExpenseCategories(userId) {
  return getCategoriesByType(userId, 'expense');
}

function getIncomeCategories(userId) {
  return getCategoriesByType(userId, 'income');
}

function getChallenges() {
  return db.prepare('SELECT * FROM challenges WHERE is_active = 1 ORDER BY sort').all();
}

function getAchievements() {
  return db.prepare('SELECT * FROM achievements WHERE is_active = 1 ORDER BY id').all();
}

module.exports = {
  getCountries, getCurrencies, getCountry, getCurrency,
  getPlans, getPlan, getCategories, getExpenseCategories, getIncomeCategories,
  getChallenges, getAchievements
};