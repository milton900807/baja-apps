from ion import works

seq1 = works.param (1)
seq2 = works.param (2)








def needleman_wunsch(seq1, seq2, match_score=1, mismatch_penalty=-1, gap_penalty=-1):
    n = len(seq1) + 1
    m = len(seq2) + 1
    score_matrix = [[0] * m for _ in range(n)]
    traceback_matrix = [[0] * m for _ in range(n)]
    for i in range(1, n):
        score_matrix[i][0] = score_matrix[i - 1][0] + gap_penalty
    for j in range(1, m):
        score_matrix[0][j] = score_matrix[0][j - 1] + gap_penalty
    for i in range(1, n):
        for j in range(1, m):
            match = score_matrix[i - 1][j - 1] + (match_score if seq1[i - 1] == seq2[j - 1] else mismatch_penalty)
            delete = score_matrix[i - 1][j] + gap_penalty
            insert = score_matrix[i][j - 1] + gap_penalty
            score_matrix[i][j] = max(match, delete, insert)
            if score_matrix[i][j] == match:
                traceback_matrix[i][j] = 'D'  # Diagonal
            elif score_matrix[i][j] == delete:
                traceback_matrix[i][j] = 'U'  # Up
            else:
                traceback_matrix[i][j] = 'L'  # Left
    align1, align2 = '', ''
    i, j = n - 1, m - 1
    while i > 0 or j > 0:
        if i > 0 and j > 0 and traceback_matrix[i][j] == 'D':
            align1 = seq1[i - 1] + align1
            align2 = seq2[j - 1] + align2
            i -= 1
            j -= 1
        elif i > 0 and traceback_matrix[i][j] == 'U':
            align1 = seq1[i - 1] + align1
            align2 = '-' + align2
            i -= 1
        else:
            align1 = '-' + align1
            align2 = seq2[j - 1] + align2
            j -= 1
    return align1, align2, score_matrix[n - 1][m - 1]

# seq1 = "GATTACA"
# seq2 = "GCATGCU"
# print ( seq1 )
# print ( seq2 )

alignment = needleman_wunsch(seq1, seq2)

print  ( " alignment ")
print ( alignment )
print  ( " --- ")

print(f"Aligned Sequences:\n{alignment[0]}\n{alignment[1]}\nScore: {alignment[2]}")

works.resolve({'alignment': alignment })

