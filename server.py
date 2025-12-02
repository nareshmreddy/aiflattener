from flask import Flask, request, jsonify, render_template
import pandas as pd
from excel_agent import ExcelAgent
import os

app = Flask(__name__, static_folder='static', template_folder='.')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    instructions = request.form.get('instructions', '')

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        agent = ExcelAgent()
        file_content = file.read()
        steps, result_df = agent.analyze_file(file_content, instructions=instructions)

        if not result_df.empty:
            result_json = result_df.fillna("").to_dict(orient='split')
        else:
            result_json = None

        return jsonify({
            "steps": steps,
            "data": result_json
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Disable debug for production-like behavior
    app.run(debug=False, host='0.0.0.0', port=5000)
