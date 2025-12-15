const app = {
    data: {
        manifest: null,
        currentQuiz: null,
        userAnswers: {},
        currentQuestionIndex: 0,
        isAnimating: false,
        cache: {},
        abortController: null,
        timerInterval: null
    },

    // --- Configuration for your 5 Subjects ---
    // Maps the JSON keys to your HTML Sidebar IDs
    config: {
        subjectMap: {
            'arch': { 
                chaptersId: 'list-arch-chapters', 
                finalsId: 'list-arch-final', 
                title: 'Architecture & OS' 
            },
            'net': { 
                chaptersId: 'list-net-chapters', 
                finalsId: 'list-net-final', 
                title: 'Networks' 
            },
            'ml': { 
                chaptersId: 'list-ml-chapters', 
                finalsId: 'list-ml-final', 
                title: 'Machine Learning' 
            },
            'java': { 
                chaptersId: 'list-java-chapters', 
                finalsId: 'list-java-final', 
                title: 'Java Programming' 
            },
            'uml': { 
                chaptersId: 'list-uml-chapters', 
                finalsId: 'list-uml-final', 
                title: 'UML & Design' 
            }
        }
    },

    init: async () => {
        const loader = document.getElementById('app-loader');
        if(loader) loader.classList.remove('hidden');

        try {
            // Ensure this points to your new structure file
            const response = await fetch('quizzes/index.json');
            if (!response.ok) throw new Error("Impossible de charger index.json");
            app.data.manifest = await response.json();
            app.renderSidebar();
        } catch (e) {
            console.error(e);
            alert("Erreur critique : Impossible de lire 'quizzes/index.json'. Vérifiez la console.");
        } finally {
            if(loader) loader.classList.add('hidden');
        }
    },

    // --- Navigation ---
    showView: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(viewId);
        if(target) target.classList.add('active');
        document.getElementById('app-content').scrollTop = 0;
    },

    showHome: () => {
        if (app.data.timerInterval) clearInterval(app.data.timerInterval);
        app.showView('view-home');
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        app.renderSavedCustom();
    },

    showCustomBuilder: () => {
        app.renderCustomBuilder();
        app.showView('view-custom-builder');
    },

    // --- Sidebar Logic (Major Update) ---
    renderSidebar: () => {
        const subjects = app.data.manifest.subjects; // Expecting new JSON structure
        if(!subjects) return;

        // Loop through our config map (arch, net, ml, etc.)
        for (const [key, config] of Object.entries(app.config.subjectMap)) {
            const subjectData = subjects[key];
            if (!subjectData) continue; // Skip if not in JSON

            // 1. Render Chapters
            const chapterContainer = document.getElementById(config.chaptersId);
            if (chapterContainer) {
                chapterContainer.innerHTML = '';
                if(subjectData.chapters) {
                    subjectData.chapters.forEach(quiz => {
                        chapterContainer.appendChild(app.createSidebarItem(quiz, 'Chapter'));
                    });
                }
            }

            // 2. Render Final Preps
            const finalContainer = document.getElementById(config.finalsId);
            if (finalContainer) {
                finalContainer.innerHTML = '';
                if(subjectData.finals) {
                    subjectData.finals.forEach(quiz => {
                        // Force Final Exam settings
                        quiz.isFinal = true; 
                        finalContainer.appendChild(app.createSidebarItem(quiz, 'Final Exam'));
                    });
                }
            }
        }

        app.renderSavedCustom();
    },

    createSidebarItem: (quizItem, type) => {
        const div = document.createElement('div');
        div.className = 'sidebar-item';
        div.innerHTML = `<div><strong>${quizItem.title}</strong></div>`;
        
        // On click, we pass the whole item object directly
        div.onclick = () => app.prepareQuiz(quizItem, div);
        return div;
    },

    renderSavedCustom: () => {
        const c = document.getElementById('list-saved');
        const saved = JSON.parse(localStorage.getItem('customQuizzes') || '[]');
        c.innerHTML = '';
        if (saved.length === 0) {
            c.innerHTML = '<p class="empty-msg" style="padding:0.5rem; color:#888;">Vide.</p>';
            return;
        }
        saved.forEach(q => {
            const div = document.createElement('div');
            div.className = 'sidebar-item';
            div.style.borderLeft = '3px solid #9b59b6';
            div.innerHTML = `<div><strong>${q.title}</strong><br><small>${q.questions.length} Qs</small></div>`;
            div.onclick = () => {
                document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                app.loadInMemoryQuiz(q);
            };
            
            // Delete Button
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if(confirm("Supprimer ?")) app.deleteCustomQuiz(q.id);
            };
            div.appendChild(delBtn);
            c.appendChild(div);
        });
    },

    deleteCustomQuiz: (id) => {
        let saved = JSON.parse(localStorage.getItem('customQuizzes') || '[]');
        saved = saved.filter(q => q.id !== id);
        localStorage.setItem('customQuizzes', JSON.stringify(saved));
        app.renderSavedCustom();
    },

    // --- Loading System ---

    fetchJson: async (url, signal, retries = 1) => {
        if (app.data.cache[url]) return JSON.parse(JSON.stringify(app.data.cache[url]));

        for (let i = 0; i <= retries; i++) {
            try {
                // Adjust path: assume files are inside 'quizzes/' folder
                const res = await fetch(`quizzes/${url}`, { signal }); 
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                app.data.cache[url] = data; 
                return data;
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                if (i === retries) throw err;
            }
        }
    },

    // Updated: Accepts the Quiz Object directly from JSON
    prepareQuiz: async (quizItem, domElement) => {
        // Cancel previous loading
        if (app.data.abortController) app.data.abortController.abort();
        app.data.abortController = new AbortController();
        const signal = app.data.abortController.signal;

        // UI
        const loader = document.getElementById('app-loader');
        if(loader) loader.classList.remove('hidden');
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        if (domElement) domElement.classList.add('active');

        try {
            // Load the specific file defined in the JSON item
            let quizData = await app.fetchJson(quizItem.file, signal);
            
            // Apply overrides from the manifest item (e.g. enforce time limit for finals)
            if(quizItem.isFinal) {
                quizData.timeLimit = quizItem.timeLimit || 60; // Default 60 mins for finals
                quizData.title = "🏆 " + quizData.title;
            }

            if (quizData && !signal.aborted) {
                app.loadInMemoryQuiz(quizData);
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Load cancelled.");
            } else {
                console.error("Error loading quiz:", error);
                alert("Erreur: Impossible de charger le fichier: " + quizItem.file);
            }
        } finally {
            if (!signal.aborted && loader) loader.classList.add('hidden');
        }
    },

    // --- Quiz Engine (Unchanged but robust) ---
    loadInMemoryQuiz: (quizObj) => {
        app.data.currentQuiz = quizObj;
        app.data.currentQuestionIndex = 0;
        app.data.userAnswers = {};
        app.data.isAnimating = false;
        
        document.getElementById('start-title').innerText = quizObj.title;
        document.getElementById('start-pass').innerText = quizObj.passPercentage || 70;
        document.getElementById('start-qcount').innerText = quizObj.questions ? quizObj.questions.length : 0;

        const infoBox = document.querySelector('.info-box p:last-child');
        if (quizObj.timeLimit) {
            infoBox.innerHTML = `<strong>⚠️ Exam Mode:</strong> You have <strong>${quizObj.timeLimit} minutes</strong>.`;
            infoBox.style.color = "#d35400";
        } else {
            infoBox.innerHTML = "Practice Mode: Unlimited time and attempts.";
            infoBox.style.color = "";
        }
        
        document.getElementById('btn-begin').onclick = app.startQuizFlow;
        app.showView('view-start');
    },

    startQuizFlow: () => {
        app.showView('view-quiz');
        app.renderQuestionNav();
        app.renderCurrentQuestion(false);

        const timerDisplay = document.getElementById('quiz-timer');
        if (app.data.timerInterval) clearInterval(app.data.timerInterval);

        if (app.data.currentQuiz.timeLimit) {
            timerDisplay.classList.remove('hidden');
            app.startTimer(app.data.currentQuiz.timeLimit * 60);
        } else {
            timerDisplay.classList.add('hidden');
        }
    },

    startTimer: (durationInSeconds) => {
        let timer = durationInSeconds;
        const display = document.getElementById('timer-val');
        
        const updateDisplay = () => {
            const h = Math.floor(timer / 3600);
            const m = Math.floor((timer % 3600) / 60);
            const s = timer % 60;
            display.textContent = `${h}:${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
            if (timer < 300) display.style.color = "red";
            else display.style.color = "";
        };

        updateDisplay();
        app.data.timerInterval = setInterval(() => {
            timer--;
            updateDisplay();
            if (timer <= 0) {
                clearInterval(app.data.timerInterval);
                alert("Time's up! Submitting...");
                app.finishQuiz();
            }
        }, 1000);
    },

    changeQuestion: (direction) => {
        if (app.data.isAnimating) return;
        const newIndex = app.data.currentQuestionIndex + direction;
        const total = app.data.currentQuiz.questions.length;
        if (newIndex < 0 || newIndex >= total) return;

        app.data.isAnimating = true;
        const wrapper = document.getElementById('q-anim-wrapper');
        if(wrapper) wrapper.classList.add('fade-out');

        setTimeout(() => {
            app.data.currentQuestionIndex = newIndex;
            app.renderCurrentQuestion(true);
            requestAnimationFrame(() => {
                if(wrapper) wrapper.classList.remove('fade-out');
                setTimeout(() => { app.data.isAnimating = false; }, 300);
            });
        }, 300);
    },

    renderQuestionNav: () => {
        const map = document.getElementById('question-nav-map');
        map.innerHTML = '';
        app.data.currentQuiz.questions.forEach((q, idx) => {
            const btn = document.createElement('div');
            btn.className = 'nav-btn';
            btn.innerText = idx + 1;
            btn.onclick = () => {
                if (idx !== app.data.currentQuestionIndex && !app.data.isAnimating) {
                    app.data.isAnimating = true;
                    const wrapper = document.getElementById('q-anim-wrapper');
                    if(wrapper) wrapper.classList.add('fade-out');
                    setTimeout(() => {
                        app.data.currentQuestionIndex = idx;
                        app.renderCurrentQuestion(true);
                        requestAnimationFrame(() => {
                            if(wrapper) wrapper.classList.remove('fade-out');
                            setTimeout(() => { app.data.isAnimating = false; }, 300);
                        });
                    }, 300);
                }
            };
            map.appendChild(btn);
        });
        app.updateNavStyles();
    },

    updateNavStyles: () => {
        document.querySelectorAll('.nav-btn').forEach((btn, idx) => {
            btn.classList.remove('active');
            if (idx === app.data.currentQuestionIndex) btn.classList.add('active');
            
            const ans = app.data.userAnswers[idx];
            let isAnswered = false;
            if (Array.isArray(ans)) isAnswered = ans.length > 0;
            else if (typeof ans === 'object' && ans !== null) isAnswered = Object.keys(ans).length > 0;
            else isAnswered = ans !== undefined;

            if (isAnswered) btn.classList.add('answered');
        });
        
        const total = app.data.currentQuiz.questions.length;
        let answeredCount = 0;
        Object.values(app.data.userAnswers).forEach(v => {
            if(Array.isArray(v) && v.length > 0) answeredCount++;
            else if(typeof v === 'object' && v !== null && Object.keys(v).length > 0) answeredCount++;
            else if(!Array.isArray(v) && typeof v !== 'object' && v !== undefined) answeredCount++;
        });

        const pct = (answeredCount / total) * 100;
        document.getElementById('progress-fill').style.width = `${pct}%`;
        document.getElementById('progress-text').innerText = `Q ${app.data.currentQuestionIndex + 1} / ${total}`;
    },

    renderCurrentQuestion: (skipNavUpdate = false) => {
        const qIndex = app.data.currentQuestionIndex;
        const qData = app.data.currentQuiz.questions[qIndex];
        const optsContainer = document.getElementById('q-options');
        optsContainer.innerHTML = ''; 

        document.getElementById('q-number').innerText = `Question ${qIndex + 1}`;
        document.getElementById('q-text').innerText = qData.question;
        document.getElementById('quiz-title-display').innerText = app.data.currentQuiz.title;

        // Image Handling
        const imgEl = document.getElementById('q-image');
        if (qData.image) {
            const imgSrc = qData.image.startsWith('http') ? qData.image : `quizzes/images/${qData.image}`;
            imgEl.src = imgSrc;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
            imgEl.src = ''; 
        }

        const instructionEl = document.getElementById('q-instruction');
        
        // --- MATCHING ---
        if (qData.type === 'match') {
            instructionEl.innerText = "Tap an answer bank item, then a slot.";
            const matchContainer = document.createElement('div');
            matchContainer.className = 'match-container';
            const currentAns = app.data.userAnswers[qIndex] || {};

            qData.pairs.forEach((pair, idx) => {
                const row = document.createElement('div');
                row.className = 'match-row';
                const prompt = document.createElement('div');
                prompt.className = 'match-prompt';
                prompt.innerText = pair.left;
                const slot = document.createElement('div');
                slot.className = 'match-slot';
                if (currentAns[idx]) {
                    slot.innerText = currentAns[idx];
                    slot.classList.add('filled');
                } else {
                    slot.innerText = "Drop here";
                }
                slot.onclick = () => app.handleMatchSlotClick(qIndex, idx);
                row.appendChild(prompt);
                row.appendChild(slot);
                matchContainer.appendChild(row);
            });
            optsContainer.appendChild(matchContainer);

            // Bank
            const bank = document.createElement('div');
            bank.className = 'match-bank';
            let allOptions = qData.pairs.map(p => p.right);
            const usedOptions = Object.values(currentAns);
            const availableOptions = allOptions.filter(opt => !usedOptions.includes(opt));
            availableOptions.sort(() => 0.5 - Math.random());
            availableOptions.forEach(optText => {
                const chip = document.createElement('div');
                chip.className = 'match-option-chip';
                chip.innerText = optText;
                chip.onclick = () => app.handleMatchBankClick(qIndex, optText);
                bank.appendChild(chip);
            });
            optsContainer.appendChild(bank);
        }
        // --- STANDARD MCQ ---
        else {
            const isMultiple = qData.type === 'multiple';
            instructionEl.innerText = isMultiple ? "Select all that apply." : "Select the best answer.";
            qData.options.forEach((opt, optIdx) => {
                const el = document.createElement('div');
                el.className = 'option-item';
                if (isMultiple) el.classList.add('multi');
                const currentAns = app.data.userAnswers[qIndex];
                let isSelected = false;
                if (isMultiple) isSelected = Array.isArray(currentAns) && currentAns.includes(optIdx);
                else isSelected = currentAns === optIdx;
                if (isSelected) el.classList.add('selected');
                el.innerHTML = `<span class="opt-marker"></span> <span>${opt.text}</span>`;
                el.onclick = () => app.handleOptionClick(qIndex, optIdx, isMultiple);
                optsContainer.appendChild(el);
            });
        }

        // Buttons
        const total = app.data.currentQuiz.questions.length;
        document.getElementById('btn-prev').disabled = qIndex === 0;
        const nextBtn = document.getElementById('btn-next');
        const finishBtn = document.getElementById('btn-finish');
        
        if (qIndex === total - 1) {
            nextBtn.classList.add('hidden');
            finishBtn.classList.remove('hidden');
            finishBtn.onclick = app.finishQuiz;
        } else {
            nextBtn.classList.remove('hidden');
            finishBtn.classList.add('hidden');
            nextBtn.onclick = () => app.changeQuestion(1);
        }
        document.getElementById('btn-prev').onclick = () => app.changeQuestion(-1);
        app.updateNavStyles();
    },

    // --- Input Handlers ---
    handleOptionClick: (qIndex, optIndex, isMultiple) => {
        if (isMultiple) {
            let current = app.data.userAnswers[qIndex] || [];
            if (!Array.isArray(current)) current = [];
            const pos = current.indexOf(optIndex);
            if (pos === -1) current.push(optIndex);
            else current.splice(pos, 1);
            app.data.userAnswers[qIndex] = current;
        } else {
            app.data.userAnswers[qIndex] = optIndex;
        }
        app.renderCurrentQuestion(true); 
    },
    handleMatchBankClick: (qIndex, answerText) => {
        let current = app.data.userAnswers[qIndex] || {};
        let targetSlot = -1;
        const qData = app.data.currentQuiz.questions[qIndex];
        // Find first empty slot
        for(let i=0; i<qData.pairs.length; i++) { if(!current[i]) { targetSlot = i; break; } }
        if (targetSlot !== -1) {
            current[targetSlot] = answerText;
            app.data.userAnswers[qIndex] = current;
            app.renderCurrentQuestion(true); 
        }
    },
    handleMatchSlotClick: (qIndex, slotIndex) => {
        let current = app.data.userAnswers[qIndex];
        if (current && current[slotIndex]) {
            delete current[slotIndex];
            app.data.userAnswers[qIndex] = current;
            app.renderCurrentQuestion(true); 
        }
    },

    // --- Scoring ---
    finishQuiz: () => {
        if (app.data.timerInterval) clearInterval(app.data.timerInterval);
        const total = app.data.currentQuiz.questions.length;
        let correctCount = 0;
        
        app.data.currentQuiz.questions.forEach((q, idx) => {
            const userAns = app.data.userAnswers[idx];
            
            if (q.type === 'match') {
                if (userAns && Object.keys(userAns).length === q.pairs.length) {
                    let allCorrect = true;
                    q.pairs.forEach((pair, pairIdx) => {
                        if (userAns[pairIdx] !== pair.right) allCorrect = false;
                    });
                    if (allCorrect) correctCount++;
                }
            } else if (q.type === 'multiple') {
                const correctIndices = q.options.map((opt, i) => opt.isCorrect ? i : -1).filter(i => i !== -1);
                const userIndices = Array.isArray(userAns) ? userAns : [];
                // Check if lengths match and every correct index is in user array
                const isCorrect = correctIndices.length === userIndices.length && correctIndices.every(val => userIndices.includes(val));
                if (isCorrect) correctCount++;
            } else {
                if (userAns !== undefined && q.options[userAns].isCorrect) correctCount++;
            }
        });

        const score = Math.round((correctCount / total) * 100);
        const pass = app.data.currentQuiz.passPercentage || 70;
        document.getElementById('result-score').innerText = `${score}%`;
        const msg = document.getElementById('result-msg');
        msg.innerText = score >= pass ? "Passed!" : "Failed";
        msg.style.color = score >= pass ? "green" : "red";
        
        if (app.data.currentQuiz.type === 'custom') {
            document.getElementById('btn-save-custom').classList.remove('hidden');
        } else {
            document.getElementById('btn-save-custom').classList.add('hidden');
        }
        app.showView('view-result');
    },

    resetQuiz: () => { app.loadInMemoryQuiz(app.data.currentQuiz); },

    startReview: () => {
        const container = document.getElementById('review-container');
        container.innerHTML = '';
        app.data.currentQuiz.questions.forEach((q, idx) => {
            const userAns = app.data.userAnswers[idx];
            const item = document.createElement('div');
            item.className = 'review-item';
            let html = `<h4>${idx + 1}. ${q.question}</h4>`;

            if (q.type === 'match') {
                html += `<div style="background:#f9f9f9; padding:10px;">`;
                q.pairs.forEach((pair, pairIdx) => {
                    const userVal = userAns ? userAns[pairIdx] : "Empty";
                    const isCorrect = userVal === pair.right;
                    html += `<div style="border-bottom:1px solid #eee; padding:5px;">
                        <span>${pair.left}</span><br>
                        ${isCorrect ? `<b style="color:green">✔ ${userVal}</b>` : `<span style="color:red">${userVal}</span> <b style="color:green">➝ ${pair.right}</b>`}
                    </div>`;
                });
                html += `</div>`;
            } else {
                q.options.forEach((opt, optIdx) => {
                    const isMultiple = q.type === 'multiple';
                    let userSelected = false;
                    if (isMultiple) userSelected = Array.isArray(userAns) && userAns.includes(optIdx);
                    else userSelected = userAns === optIdx;
                    
                    let style = "padding:8px; border:1px solid #eee; margin:2px;";
                    if(opt.isCorrect) style += "background:#dff0d8; color:#3c763d;"; 
                    if(userSelected && !opt.isCorrect) style += "background:#f2dede; color:#a94442;";
                    let marker = userSelected ? " <strong>(Your Answer)</strong>" : "";
                    
                    html += `<div style="${style}">${opt.text} ${marker}</div>`;
                });
            }
            if (q.explanation) html += `<div class="explanation"><strong>Explanation:</strong> ${q.explanation}</div>`;
            item.innerHTML = html;
            container.appendChild(item);
        });
        app.showView('view-review');
    },

    // --- Custom Builder (Updated for Multi-Subject) ---
    renderCustomBuilder: () => {
        const list = document.getElementById('builder-module-list');
        list.innerHTML = '';
        const subjects = app.data.manifest.subjects;
        if(!subjects) return;

        // Iterate through all subjects
        for (const [key, subj] of Object.entries(subjects)) {
            // Header for the group
            const h4 = document.createElement('h4');
            h4.innerText = subj.title || key.toUpperCase();
            h4.style.marginTop = "1rem";
            h4.style.borderBottom = "1px solid #ccc";
            list.appendChild(h4);

            if(subj.chapters) {
                subj.chapters.forEach(m => {
                    const label = document.createElement('label');
                    label.className = 'cb-item';
                    // We store the file path directly in the value
                    label.innerHTML = `<input type="checkbox" value="${m.file}" class="mod-cb"> ${m.title}`;
                    list.appendChild(label);
                });
            }
        }
    },

    generateCustomQuiz: async () => {
        // Collect selected files
        const selectedFiles = Array.from(document.querySelectorAll('.mod-cb:checked')).map(cb => cb.value);
        if (selectedFiles.length === 0) { alert("Select at least one module."); return; }
        
        const count = parseInt(document.getElementById('custom-count').value) || 20;
        const title = document.getElementById('custom-title').value || "Custom Revision";
        
        if (app.data.abortController) app.data.abortController.abort();
        app.data.abortController = new AbortController();
        const signal = app.data.abortController.signal;

        const loader = document.getElementById('app-loader');
        loader.classList.remove('hidden');

        try {
            let pool = [];
            const batchSize = 5;
            
            for (let i = 0; i < selectedFiles.length; i += batchSize) {
                if(signal.aborted) throw new Error("AbortError");
                const batch = selectedFiles.slice(i, i + batchSize);
                const promises = batch.map(fileUrl => 
                    app.fetchJson(fileUrl, signal)
                        .then(data => data.questions || [])
                        .catch(() => [])
                );
                const results = await Promise.all(promises);
                results.forEach(qs => pool = pool.concat(qs));
            }

            pool.sort(() => 0.5 - Math.random());
            const finalQuestions = pool.slice(0, count);
            const customQuiz = { 
                id: 'custom-' + Date.now(), 
                type: 'custom', 
                title: title, 
                passPercentage: 60, 
                questions: finalQuestions
            };
            
            if(!signal.aborted) app.loadInMemoryQuiz(customQuiz);

        } catch(e) {
            if(e.name !== 'AbortError') alert("Error generating custom quiz.");
        } finally {
            if(!signal.aborted) loader.classList.add('hidden');
        }
    },

    saveCustomQuiz: () => {
        const quiz = app.data.currentQuiz;
        if (quiz.type !== 'custom') return;
        const saved = JSON.parse(localStorage.getItem('customQuizzes') || '[]');
        saved.push(quiz);
        localStorage.setItem('customQuizzes', JSON.stringify(saved));
        alert("Quiz saved to sidebar!");
        app.renderSavedCustom();
    }
};

window.onload = app.init;