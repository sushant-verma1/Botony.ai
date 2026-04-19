// Emergency symptoms that need immediate 102 call
const EMERGENCY_SYMPTOMS = [
  'chest pain',
  'difficulty breathing',
  'severe bleeding',
  'loss of consciousness',
  'severe allergic reaction',
  'poisoning',
  'suspected stroke',
  'severe abdominal pain',
  'suicidal',
  'anaphylaxis',
  'facial drooping',
  'arm weakness',
  'speech difficulty'
]

// Check if user message contains emergency symptoms
function detectEmergency(userInput: string): boolean {
  const lowerInput = userInput.toLowerCase()
  
  for (const symptom of EMERGENCY_SYMPTOMS) {
    if (lowerInput.includes(symptom)) {
      return true
    }
  }
  
  return false
}

// Response for emergencies (DON'T call Claude)
function getEmergencyResponse(): string {
  return `⚠️ EMERGENCY WARNING ⚠️

This symptom may require IMMEDIATE MEDICAL ATTENTION.

🚑 CALL 911 IMMEDIATELY OR GO TO THE NEAREST EMERGENCY ROOM.

Do NOT delay. This could be life-threatening.

This is NOT medical advice. Only emergency services can provide 
proper evaluation and treatment.`
}

// Disclaimer to add to EVERY response
function getMedicalDisclaimer(): string {
  return `

⚠️ IMPORTANT DISCLAIMER:
I am NOT a licensed physician. This information is for educational 
purposes ONLY and does NOT replace professional medical advice.

Always consult with a real doctor for:
- Diagnosis of medical conditions
- Prescription medications
- Medical advice specific to your situation

If you have a medical emergency, CALL 911 immediately.`
}

export {
  EMERGENCY_SYMPTOMS,
  detectEmergency,
  getEmergencyResponse,
  getMedicalDisclaimer
}